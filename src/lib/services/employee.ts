// Logika bisnis karyawan — Tech Spec §6.1, URD EMP-01..06.
// Semua fungsi menerima `db` supaya bisa dites dengan database test.
import argon2 from "argon2";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { nikIndex } from "@/lib/crypto/field-encryption";
import { fromIsoDate } from "@/lib/format";
import type { RequestMeta } from "@/lib/request-meta";
import type { EmployeeAdminUpdateInput, EmployeeCreateInput, EmployeeSelfInput } from "@/lib/validators/employee";
import { assertCanManageAccount, assertCanSetLoginEmail } from "./account-protection";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";
import { openEmployee, sealEmployeeData } from "./personal-data";
import { loginEmailChangedAlert, privilegedAccountCreatedAlert, roleChangedAlert, type SecurityAlert } from "./security-monitor";
import { assertCanLoseApproverRights } from "./user-admin";
import { canApprove } from "@/lib/roles";
import { assertDivisions } from "./division";

type Tx = Prisma.TransactionClient;

// ---------------------------------------------------------------------
// Pengecekan keunikan
// ---------------------------------------------------------------------

async function assertEmailAvailable(tx: Tx, email: string, exceptEmployeeId?: string) {
  const [employee, user] = await Promise.all([
    tx.employee.findUnique({ where: { email }, select: { id: true } }),
    tx.user.findUnique({ where: { email }, select: { employeeId: true } }),
  ]);
  const takenByOther =
    (employee && employee.id !== exceptEmployeeId) || (user && user.employeeId !== exceptEmployeeId);
  if (takenByOther) throw new ServiceError("Email sudah dipakai karyawan lain", "email");
}

async function assertNikAvailable(tx: Tx, nik: string | null | undefined, exceptEmployeeId: string) {
  if (!nik) return;
  // NIK tersimpan terenkripsi (hardening Tahap 4) → dicari lewat sidik jarinya.
  const owner = await tx.employee.findUnique({ where: { nikHash: nikIndex(nik) }, select: { id: true } });
  if (owner && owner.id !== exceptEmployeeId) {
    throw new ServiceError("NIK sudah terdaftar, hubungi Admin", "nik");
  }
}

async function assertEmployeeNoAvailable(tx: Tx, employeeNo: string | null | undefined, exceptEmployeeId: string) {
  if (!employeeNo) return;
  const owner = await tx.employee.findUnique({ where: { employeeNo }, select: { id: true } });
  if (owner && owner.id !== exceptEmployeeId) {
    throw new ServiceError("NIP sudah dipakai karyawan lain", "employeeNo");
  }
}

/** Data diri → kolom Prisma. Kolom data pribadi dikunci (hardening Tahap 4); tanggal lahir disimpan sebagai YYYY-MM-DD. */
function selfData(input: EmployeeSelfInput) {
  return {
    birthPlace: input.birthPlace,
    gender: input.gender,
    maritalStatus: input.maritalStatus,
    address: input.address,
    ...sealEmployeeData({
      nik: input.nik,
      kkNo: input.kkNo,
      birthDate: input.birthDate || null,
      phone: input.phone,
      npwp: input.npwp,
      bpjsTkNo: input.bpjsTkNo,
      bpjsKesNo: input.bpjsKesNo,
      emergencyName: input.emergencyName,
      emergencyRelation: input.emergencyRelation,
      emergencyPhone: input.emergencyPhone,
    }),
  };
}

async function getEmployeeOrThrow(tx: Tx, employeeId: string) {
  const employee = await tx.employee.findUnique({
    where: { id: employeeId },
    // isSuperAdmin: untuk pengecekan akun yang dilindungi (account-protection.ts, audit keamanan 2026-11-26).
    include: { user: { select: { id: true, role: true, email: true, isSuperAdmin: true } } },
  });
  if (!employee) throw new ServiceError("Karyawan tidak ditemukan");
  return employee;
}

/** F2 (audit keamanan 2026-11-26): nama pelaku untuk isi alarm keamanan. */
async function actorName(tx: Tx, actorId: string): Promise<string> {
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: { email: true, employee: { select: { fullName: true } } } });
  return actor?.employee?.fullName ?? actor?.email ?? "—";
}

// ---------------------------------------------------------------------
// Operasi
// ---------------------------------------------------------------------

/**
 * Buat Employee + periode kerja pertama + User di dalam transaksi yang sudah ada (dipakai juga
 * konversi kandidat). `passwordHash` di-hash di luar transaksi karena argon2 lambat.
 * `alert` (F2): akun Admin/Approver baru → alarm untuk semua Admin; pemanggil mengirimnya SETELAH commit.
 */
export async function createEmployeeInTx(tx: Tx, actorId: string, input: EmployeeCreateInput, passwordHash: string, meta?: RequestMeta) {
  await assertEmailAvailable(tx, input.email);
  // F1 (audit keamanan 2026-11-26): akun baru dengan email pemegang kunci pemulihan hanya boleh dibuat super admin.
  await assertCanSetLoginEmail(tx, { from: null, to: input.email }, actorId);
  await assertDivisions(tx, [input.division]);

  const employee = await tx.employee.create({
    data: {
      fullName: input.fullName,
      email: input.email,
      division: input.division,
      position: input.position,
      periods: { create: { startDate: fromIsoDate(input.startDate) } },
      user: { create: { email: input.email, passwordHash, role: input.role, mustChangePassword: true } },
    },
    include: { user: { select: { id: true } } },
  });

  await logAudit(tx, {
    actorId,
    action: "CREATE",
    entity: "Employee",
    entityId: employee.id,
    after: { ...employee, role: input.role, startDate: input.startDate },
  });

  // F2 (audit keamanan 2026-11-26): akun Admin/Approver baru dilaporkan ke semua Admin (akun Staf → null).
  const alert = canApprove(input.role)
    ? await privilegedAccountCreatedAlert(
        tx,
        { userId: employee.user!.id, userName: input.fullName, email: input.email, role: input.role, actorName: await actorName(tx, actorId) },
        meta,
      )
    : null;

  return { employeeId: employee.id, userId: employee.user!.id, alert };
}

/** Admin membuat akun minimal: Employee + periode kerja pertama + User (password awal dari Admin). */
export async function createEmployee(db: PrismaClient, actorId: string, input: EmployeeCreateInput, meta?: RequestMeta) {
  const passwordHash = await argon2.hash(input.password);
  return db.$transaction((tx) => createEmployeeInTx(tx, actorId, input, passwordHash, meta));
}

/** Staf melengkapi/mengubah data dirinya sendiri (EMP-06). */
export async function updateSelf(db: PrismaClient, actorId: string, employeeId: string, input: EmployeeSelfInput) {
  return db.$transaction((tx) => applySelfDataInTx(tx, actorId, employeeId, input));
}

/** Terapkan data diri (dipakai langsung & saat permintaan perubahan disetujui Ci Ika, 2026-10-12). */
export async function applySelfDataInTx(tx: Tx, actorId: string, employeeId: string, input: EmployeeSelfInput) {
  const before = await getEmployeeOrThrow(tx, employeeId);
  if (before.status !== "ACTIVE") throw new ServiceError("Data karyawan yang sudah resign tidak bisa diubah");
  await assertNikAvailable(tx, input.nik, employeeId);

  // NIP, nama, jabatan, level tidak termasuk data diri (hanya Admin, Fase 14).
  const after = await tx.employee.update({ where: { id: employeeId }, data: selfData(input) });

  await logAudit(tx, { actorId, action: "UPDATE", entity: "Employee", entityId: employeeId, before, after });
  return openEmployee(after);
}

/**
 * Admin mengubah semua data, termasuk divisi, role, email login, dan tanggal masuk periode terakhir.
 * `alerts` (F2): ubah role / email login → alarm untuk semua Admin; pemanggil mengirimnya SETELAH commit.
 */
export async function updateByAdmin(
  db: PrismaClient,
  actorId: string,
  employeeId: string,
  input: EmployeeAdminUpdateInput,
  meta?: RequestMeta,
) {
  return db.$transaction(async (tx) => {
    await assertDivisions(tx, [input.division]);
    const before = await getEmployeeOrThrow(tx, employeeId);
    if (before.user?.id === actorId && before.user.role !== input.role) {
      throw new ServiceError("Anda tidak bisa mengubah role akun Anda sendiri", "role");
    }
    // F1 (audit keamanan 2026-11-26): role & email login akun yang dilindungi (super admin, pemegang kunci pemulihan) tidak
    // bisa diubah Admin lain, dan email pemegang kunci tidak bisa dipasang / dilepas — termasuk di akun sendiri.
    // Data lain (jabatan, data diri, dst.) tetap boleh diubah Admin.
    const roleChanged = Boolean(before.user && before.user.role !== input.role);
    const emailChanged = Boolean(before.user && before.user.email !== input.email);
    if (before.user && (roleChanged || emailChanged)) {
      await assertCanManageAccount(tx, before.user, actorId, { field: emailChanged ? "email" : "role" });
    }
    if (before.user && emailChanged) {
      await assertCanSetLoginEmail(tx, { from: before.user.email, to: input.email }, actorId);
    }
    if (before.user && canApprove(before.user.role) && !canApprove(input.role)) {
      await assertCanLoseApproverRights(tx, before.user.id, before.fullName);
    }
    await assertEmailAvailable(tx, input.email, employeeId);
    await assertNikAvailable(tx, input.nik, employeeId);
    await assertEmployeeNoAvailable(tx, input.employeeNo, employeeId);

    // Tanggal masuk hanya untuk periode terakhir; harus setelah periode sebelumnya berakhir.
    const [latest, previous] = await tx.employmentPeriod.findMany({
      where: { employeeId },
      orderBy: { startDate: "desc" },
      take: 2,
    });
    const startDate = fromIsoDate(input.startDate);
    if (latest.endDate && startDate > latest.endDate) {
      throw new ServiceError("Tanggal masuk tidak boleh setelah tanggal keluar", "startDate");
    }
    if (previous?.endDate && startDate <= previous.endDate) {
      throw new ServiceError("Tanggal masuk harus setelah tanggal keluar periode sebelumnya", "startDate");
    }
    await tx.employmentPeriod.update({ where: { id: latest.id }, data: { startDate } });

    const after = await tx.employee.update({
      where: { id: employeeId },
      data: { ...selfData(input), fullName: input.fullName, position: input.position, level: input.level, employeeNo: input.employeeNo, email: input.email, division: input.division },
    });
    if (before.user) {
      await tx.user.update({
        where: { id: before.user.id },
        // F2 (audit keamanan 2026-11-26): email login diganti → semua sesi akun itu berakhir (login ulang dengan email baru).
        data: { email: input.email, role: input.role, ...(emailChanged ? { sessionVersion: { increment: 1 } } : {}) },
      });
    }

    await logAudit(tx, {
      actorId,
      action: "UPDATE",
      entity: "Employee",
      entityId: employeeId,
      before: { ...before, startDate: latest.startDate },
      after: { ...after, role: input.role, startDate },
    });

    // F2 (audit keamanan 2026-11-26): ubah role / email login lewat form karyawan dilaporkan ke semua Admin — sama seperti
    // Setting → User.
    const alerts: SecurityAlert[] = [];
    if (before.user && (roleChanged || emailChanged)) {
      const by = await actorName(tx, actorId);
      if (roleChanged) {
        const alert = await roleChangedAlert(tx, { userId: before.user.id, userName: before.fullName, from: before.user.role, to: input.role, actorName: by }, meta);
        if (alert) alerts.push(alert);
      }
      if (emailChanged) {
        const alert = await loginEmailChangedAlert(tx, { userId: before.user.id, userName: before.fullName, from: before.user.email, to: input.email, actorName: by }, meta);
        if (alert) alerts.push(alert);
      }
    }
    return { employee: openEmployee(after), alerts };
  });
}

/**
 * Resign (EMP-03): tutup periode aktif, status RESIGNED, akun dinonaktifkan.
 * Data tidak dihapus.
 */
export async function resignEmployee(db: PrismaClient, actorId: string, employeeId: string, endDateIso: string) {
  return db.$transaction(async (tx) => {
    const employee = await getEmployeeOrThrow(tx, employeeId);
    if (employee.status !== "ACTIVE") throw new ServiceError("Karyawan sudah berstatus resign");
    if (employee.user?.id === actorId) throw new ServiceError("Anda tidak bisa me-resign akun Anda sendiri");
    // F1 (audit keamanan 2026-11-26): resign menonaktifkan akun — sama dengan nonaktifkan di Setting → User.
    if (employee.user) await assertCanManageAccount(tx, employee.user, actorId);
    if (employee.user && canApprove(employee.user.role)) await assertCanLoseApproverRights(tx, employee.user.id, employee.fullName);

    const period = await tx.employmentPeriod.findFirst({ where: { employeeId, endDate: null } });
    if (!period) throw new ServiceError("Periode kerja aktif tidak ditemukan");

    const endDate = fromIsoDate(endDateIso);
    if (endDate < period.startDate) {
      throw new ServiceError("Tanggal keluar tidak boleh sebelum tanggal masuk", "endDate");
    }

    await tx.employmentPeriod.update({ where: { id: period.id }, data: { endDate, endReason: "RESIGN" } });
    await tx.employee.update({ where: { id: employeeId }, data: { status: "RESIGNED" } });
    if (employee.user) await tx.user.update({ where: { id: employee.user.id }, data: { isActive: false } });

    await logAudit(tx, {
      actorId,
      action: "RESIGN",
      entity: "Employee",
      entityId: employeeId,
      before: { status: "ACTIVE" },
      after: { status: "RESIGNED", endDate },
    });
  });
}

/**
 * Rehire dari Arsip (EMP-04): record lama dipakai lagi dengan periode kerja baru,
 * status ACTIVE, akun diaktifkan kembali.
 */
export async function rehireEmployee(db: PrismaClient, actorId: string, employeeId: string, startDateIso: string) {
  return db.$transaction(async (tx) => {
    const employee = await getEmployeeOrThrow(tx, employeeId);
    if (employee.status !== "RESIGNED") throw new ServiceError("Karyawan masih aktif");
    // F1 (audit keamanan 2026-11-26): rehire mengaktifkan akun kembali — sama dengan aktifkan di Setting → User.
    if (employee.user) await assertCanManageAccount(tx, employee.user, actorId);

    const lastPeriod = await tx.employmentPeriod.findFirst({ where: { employeeId }, orderBy: { startDate: "desc" } });
    const startDate = fromIsoDate(startDateIso);
    if (lastPeriod?.endDate && startDate <= lastPeriod.endDate) {
      throw new ServiceError("Tanggal masuk baru harus setelah tanggal keluar sebelumnya", "startDate");
    }

    await tx.employmentPeriod.create({ data: { employeeId, startDate } });
    await tx.employee.update({ where: { id: employeeId }, data: { status: "ACTIVE" } });
    if (employee.user) await tx.user.update({ where: { id: employee.user.id }, data: { isActive: true } });

    await logAudit(tx, {
      actorId,
      action: "REHIRE",
      entity: "Employee",
      entityId: employeeId,
      before: { status: "RESIGNED" },
      after: { status: "ACTIVE", startDate },
    });
  });
}
