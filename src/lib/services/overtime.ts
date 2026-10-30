// Overtime engineer (2026-10-30) — terpisah dari absensi. Clock in kapan saja (juga akhir pekan/libur), boleh beberapa
// sesi per hari, tapi hanya satu sesi berjalan. Clock out = finalize: pilih customer + project, isi pekerjaan, lalu
// diajukan ke approver (modul OVERTIME, nomor OVT/…, Ko Yosep). Sesi APPROVED bisa dipilih di Reimburse Overtime
// (pengajuan reimburse terpisah, alur modul OVERTIME_REIMBURSE = Ci Ika, yang mengisi nominalnya). Jam selalu dari server.
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { isWorkday } from "@/lib/attendance";
import { fromIsoDate, toJakartaIsoDate } from "@/lib/format";
import type { OvertimeFinishInput } from "@/lib/validators/overtime";
import type { Actor } from "./access";
import { type ApprovalNotification, restartApproval } from "./approval";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";
import { nextDocumentNumber } from "./numbering";

type Tx = Prisma.TransactionClient;

/** Divisi yang memakai overtime. */
export const OVERTIME_DIVISION = "ENGINEER";
/** Kode tipe reimburse untuk baris overtime (dibuat migrasi; dibuat ulang bila belum ada). */
export const OVERTIME_REIMBURSE_TYPE = "OVERTIME";

/** Hari kerja (bukan Sabtu/Minggu/libur) untuk tiap tanggal overtime — penanda "Weekend / libur" untuk approver. */
export async function overtimeWorkdays(db: Tx | PrismaClient, dates: Date[]): Promise<(date: Date) => boolean> {
  const holidays = dates.length ? await db.holiday.findMany({ where: { date: { in: dates }, deletedAt: null }, select: { date: true } }) : [];
  const set = new Set(holidays.map((h) => toJakartaIsoDate(h.date)));
  return (date) => isWorkday(toJakartaIsoDate(date), set);
}

/** Karyawan aktif divisi Engineer = boleh overtime. */
export async function canUseOvertime(db: Tx | PrismaClient, employeeId: string | null): Promise<boolean> {
  if (!employeeId) return false;
  const employee = await db.employee.findUnique({ where: { id: employeeId }, select: { status: true, division: true } });
  return employee?.status === "ACTIVE" && employee.division === OVERTIME_DIVISION;
}

async function requireOvertimeEmployee(tx: Tx, actor: Actor) {
  if (!actor.employeeId) throw new ServiceError("Akun Anda belum terhubung ke data karyawan. Hubungi Admin.");
  if (!(await canUseOvertime(tx, actor.employeeId))) throw new ServiceError("Overtime hanya untuk karyawan aktif divisi Engineer");
  return actor.employeeId;
}

async function getOwnOvertime(tx: Tx, actor: Actor, overtimeId: string) {
  const overtime = await tx.overtime.findUnique({ where: { id: overtimeId } });
  if (!overtime || overtime.employeeId !== actor.employeeId) throw new ServiceError("Overtime tidak ditemukan");
  return overtime;
}

/** Mulai overtime (clock in). Ditolak bila masih ada sesi yang belum di-clock out. */
export async function startOvertime(db: PrismaClient, actor: Actor, now = new Date()) {
  try {
    return await db.$transaction(async (tx) => {
      const employeeId = await requireOvertimeEmployee(tx, actor);
      if (await tx.overtime.findFirst({ where: { employeeId, clockOut: null } })) {
        throw new ServiceError("Overtime sebelumnya belum di-clock out");
      }
      const record = await tx.overtime.create({ data: { employeeId, date: fromIsoDate(toJakartaIsoDate(now)), clockIn: now } });
      await logAudit(tx, { actorId: actor.id, action: "CREATE", entity: "Overtime", entityId: record.id, after: record });
      return record;
    });
  } catch (error) {
    // Dua klik bersamaan: indeks unik "Overtime_open_key" menolak sesi berjalan kedua.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ServiceError("Overtime sebelumnya belum di-clock out");
    }
    throw error;
  }
}

export type FinishOvertimeResult = { number: string; status: "PENDING" | "APPROVED"; notifications: ApprovalNotification[] };

/**
 * Clock out + finalize: customer (master), project aktif milik customer itu, dan pekerjaan wajib; lalu diajukan ke
 * approver (Ko Yosep). Sesi yang DITOLAK direvisi lewat fungsi yang sama: jam tetap, isian diganti, diajukan ulang
 * dengan nomor yang sama. Email di-enqueue pemanggil setelah commit.
 */
export async function finishOvertime(db: PrismaClient, actor: Actor, overtimeId: string, input: OvertimeFinishInput, now = new Date()): Promise<FinishOvertimeResult> {
  return db.$transaction(async (tx) => {
    await requireOvertimeEmployee(tx, actor);
    const before = await getOwnOvertime(tx, actor, overtimeId);
    const revise = before.status === "REJECTED";
    if (before.clockOut && !revise) throw new ServiceError("Overtime ini sudah selesai");
    const customer = await tx.customer.findUnique({ where: { id: input.customerId, deletedAt: null } });
    if (!customer) throw new ServiceError("Customer tidak ditemukan di master", "customerId");
    const project = await tx.project.findUnique({ where: { id: input.projectId } });
    if (!project?.isActive) throw new ServiceError("Project tidak ditemukan atau sudah tidak aktif", "projectId");
    if (project.customerId !== customer.id) throw new ServiceError(`Project bukan milik ${customer.name}`, "projectId");

    const number = before.number ?? (await nextDocumentNumber(tx, "OVT"));
    // Bersyarat: dua klik bersamaan tidak menimpa jam clock out / revisi pertama.
    const { count } = await tx.overtime.updateMany({
      where: { id: before.id, status: before.status, clockOut: before.clockOut },
      data: { ...(revise ? {} : { clockOut: now }), customerId: customer.id, projectId: project.id, activity: input.activity, number, status: "PENDING" },
    });
    if (count === 0) throw new ServiceError("Overtime ini sudah selesai");
    const approval = await restartApproval(tx, { module: "OVERTIME", entityId: before.id, entityNumber: number, requesterId: actor.id });
    const after = await tx.overtime.findUniqueOrThrow({ where: { id: before.id } });
    await logAudit(tx, { actorId: actor.id, action: "UPDATE", entity: "Overtime", entityId: before.id, before, after: { ...after, resubmit: revise } });
    return { number, status: approval.status, notifications: approval.notifications };
  });
}

/** Batalkan sesi yang masih berjalan (salah tekan Clock In). Sesi yang sudah selesai tidak bisa dibatalkan. */
export async function cancelOvertime(db: PrismaClient, actor: Actor, overtimeId: string) {
  return db.$transaction(async (tx) => {
    const before = await getOwnOvertime(tx, actor, overtimeId);
    if (before.clockOut) throw new ServiceError("Overtime ini sudah selesai");
    await tx.overtime.delete({ where: { id: before.id } });
    await logAudit(tx, { actorId: actor.id, action: "DELETE", entity: "Overtime", entityId: before.id, before });
  });
}

/** Tipe reimburse OVERTIME (dibuat migrasi). Dibuat ulang bila belum ada; `divisions` kosong = tidak muncul di dropdown. */
export async function overtimeReimburseType(tx: Tx) {
  return tx.reimburseType.upsert({
    where: { code: OVERTIME_REIMBURSE_TYPE },
    create: { code: OVERTIME_REIMBURSE_TYPE, name: "Overtime", divisions: [] },
    update: {},
  });
}

/**
 * Baris reimburse dari overtime yang dipilih: sesi milik pemohon, sudah DISETUJUI, dan belum dipakai reimburse lain
 * (`reimbursementId` = reimburse yang sedang diubah, boleh dipakai ulang). Isi baris diambil dari data overtime; nominal
 * awal 0 (atau nominal sebelumnya di reimburse yang sama) — diisi approver (Ci Ika) saat menyetujui.
 */
export async function overtimeReimbursementItems(tx: Tx, employeeId: string, overtimeIds: string[], reimbursementId: string | null) {
  if (overtimeIds.length === 0) return [];
  if (new Set(overtimeIds).size !== overtimeIds.length) throw new ServiceError("Overtime yang sama dipilih lebih dari sekali");
  const type = await overtimeReimburseType(tx);
  const overtimes = await tx.overtime.findMany({
    where: { id: { in: overtimeIds } },
    include: {
      customer: { select: { name: true } },
      reimbursementItem: { select: { reimbursementId: true, amount: true, reimbursement: { select: { number: true } } } },
    },
    orderBy: { clockIn: "asc" },
  });
  if (overtimes.length !== overtimeIds.length || overtimes.some((o) => o.employeeId !== employeeId)) throw new ServiceError("Overtime tidak ditemukan");
  return overtimes.map((overtime) => {
    const label = `Overtime ${toJakartaIsoDate(overtime.clockIn)}`;
    if (!overtime.clockOut || !overtime.customerId || !overtime.activity) throw new ServiceError(`${label} belum selesai`);
    if (overtime.status !== "APPROVED") throw new ServiceError(`${label} belum disetujui approver`);
    const usedBy = overtime.reimbursementItem;
    if (usedBy && usedBy.reimbursementId !== reimbursementId) {
      const where = usedBy.reimbursement.number.startsWith("DRAFT-") ? "draft reimburse lain" : `reimburse ${usedBy.reimbursement.number}`;
      throw new ServiceError(`${label} sudah dipakai di ${where}`);
    }
    return {
      date: overtime.date,
      customerId: overtime.customerId,
      projectId: overtime.projectId,
      newAcquisition: false,
      activity: overtime.activity,
      participants: "",
      location: overtime.customer?.name ?? "-",
      typeId: type.id,
      hasReceipt: false,
      paymentMethod: "PERSONAL" as const,
      amount: usedBy?.amount ?? 0n,
      overtimeId: overtime.id,
    };
  });
}
