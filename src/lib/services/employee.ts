// Logika bisnis karyawan — Tech Spec §6.1, URD EMP-01..06.
// Semua fungsi menerima `db` supaya bisa dites dengan database test.
import argon2 from "argon2";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { fromIsoDate } from "@/lib/format";
import type { EmployeeAdminUpdateInput, EmployeeCreateInput, EmployeeSelfInput } from "@/lib/validators/employee";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";
import { assertCanLoseApproverRights } from "./user-admin";

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
  const owner = await tx.employee.findUnique({ where: { nik }, select: { id: true } });
  if (owner && owner.id !== exceptEmployeeId) {
    throw new ServiceError("NIK sudah terdaftar, hubungi Admin", "nik");
  }
}

async function assertEmployeeNoAvailable(tx: Tx, employeeNo: string | null | undefined, exceptEmployeeId: string) {
  if (!employeeNo) return;
  const owner = await tx.employee.findUnique({ where: { employeeNo }, select: { id: true } });
  if (owner && owner.id !== exceptEmployeeId) {
    throw new ServiceError("Nomor karyawan sudah dipakai karyawan lain", "employeeNo");
  }
}

/** Data diri → kolom Prisma (tanggal ISO → Date). */
function selfData(input: EmployeeSelfInput) {
  return {
    fullName: input.fullName,
    position: input.position,
    employeeNo: input.employeeNo,
    level: input.level,
    nik: input.nik,
    kkNo: input.kkNo,
    birthPlace: input.birthPlace,
    birthDate: input.birthDate ? fromIsoDate(input.birthDate) : null,
    gender: input.gender,
    maritalStatus: input.maritalStatus,
    address: input.address,
    phone: input.phone,
    npwp: input.npwp,
    bpjsTkNo: input.bpjsTkNo,
    bpjsKesNo: input.bpjsKesNo,
  };
}

async function getEmployeeOrThrow(tx: Tx, employeeId: string) {
  const employee = await tx.employee.findUnique({
    where: { id: employeeId },
    include: { user: { select: { id: true, role: true, email: true } } },
  });
  if (!employee) throw new ServiceError("Karyawan tidak ditemukan");
  return employee;
}

// ---------------------------------------------------------------------
// Operasi
// ---------------------------------------------------------------------

/**
 * Buat Employee + periode kerja pertama + User di dalam transaksi yang sudah ada (dipakai juga
 * konversi kandidat). `passwordHash` di-hash di luar transaksi karena argon2 lambat.
 */
export async function createEmployeeInTx(tx: Tx, actorId: string, input: EmployeeCreateInput, passwordHash: string) {
  await assertEmailAvailable(tx, input.email);

  const employee = await tx.employee.create({
    data: {
      fullName: input.fullName,
      email: input.email,
      division: input.division,
      position: input.position,
      periods: { create: { startDate: fromIsoDate(input.startDate) } },
      user: { create: { email: input.email, passwordHash, role: input.role } },
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

  return { employeeId: employee.id, userId: employee.user!.id };
}

/** Admin membuat akun minimal: Employee + periode kerja pertama + User (password awal dari Admin). */
export async function createEmployee(db: PrismaClient, actorId: string, input: EmployeeCreateInput) {
  const passwordHash = await argon2.hash(input.password);
  return db.$transaction((tx) => createEmployeeInTx(tx, actorId, input, passwordHash));
}

/** Staf melengkapi/mengubah data dirinya sendiri (EMP-06). */
export async function updateSelf(db: PrismaClient, actorId: string, employeeId: string, input: EmployeeSelfInput) {
  return db.$transaction(async (tx) => {
    const before = await getEmployeeOrThrow(tx, employeeId);
    if (before.status !== "ACTIVE") throw new ServiceError("Data karyawan yang sudah resign tidak bisa diubah");
    await assertNikAvailable(tx, input.nik, employeeId);
    await assertEmployeeNoAvailable(tx, input.employeeNo, employeeId);

    const after = await tx.employee.update({ where: { id: employeeId }, data: selfData(input) });

    await logAudit(tx, { actorId, action: "UPDATE", entity: "Employee", entityId: employeeId, before, after });
    return after;
  });
}

/** Admin mengubah semua data, termasuk divisi, role, email login, dan tanggal masuk periode terakhir. */
export async function updateByAdmin(
  db: PrismaClient,
  actorId: string,
  employeeId: string,
  input: EmployeeAdminUpdateInput,
) {
  return db.$transaction(async (tx) => {
    const before = await getEmployeeOrThrow(tx, employeeId);
    if (before.user?.id === actorId && before.user.role !== input.role) {
      throw new ServiceError("Anda tidak bisa mengubah role akun Anda sendiri", "role");
    }
    if (before.user?.role === "ADMIN" && input.role !== "ADMIN") {
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
      data: { ...selfData(input), email: input.email, division: input.division },
    });
    if (before.user) {
      await tx.user.update({ where: { id: before.user.id }, data: { email: input.email, role: input.role } });
    }

    await logAudit(tx, {
      actorId,
      action: "UPDATE",
      entity: "Employee",
      entityId: employeeId,
      before: { ...before, startDate: latest.startDate },
      after: { ...after, role: input.role, startDate },
    });
    return after;
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
    if (employee.user?.role === "ADMIN") await assertCanLoseApproverRights(tx, employee.user.id, employee.fullName);

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
