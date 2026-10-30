// Overtime engineer (2026-10-30) — terpisah dari absensi. Clock in kapan saja (juga akhir pekan/libur), boleh beberapa
// sesi per hari, tapi hanya satu sesi berjalan. Clock out = finalize: pilih customer + project dan isi pekerjaan.
// Sesi yang selesai dipilih di form reimburse (tipe OVERTIME); nominal = durasi × tarif per jam weekday atau
// weekend/libur (menurut tanggal mulai). Tanpa approval
// sendiri — approval terjadi lewat reimburse. Jam selalu dari server.
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { isWorkday } from "@/lib/attendance";
import { fromIsoDate, toJakartaIsoDate } from "@/lib/format";
import { type OvertimeFinishInput, type OvertimeRates, overtimeAmount, overtimeMinutes, overtimeRateFor } from "@/lib/validators/overtime";
import type { Actor } from "./access";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";

type Tx = Prisma.TransactionClient;

/** Divisi yang memakai overtime. */
export const OVERTIME_DIVISION = "ENGINEER";
/** Kode tipe reimburse untuk baris overtime (dibuat migrasi; dibuat ulang bila belum ada). */
export const OVERTIME_REIMBURSE_TYPE = "OVERTIME";
export const OVERTIME_RATE_KEY = "overtime.hourlyRate";

const positiveInt = (value: unknown) => (typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0);

/** Tarif overtime per jam weekday & weekend/libur (Rupiah); 0 = belum diatur Admin. */
export async function getOvertimeRates(db: Tx | PrismaClient): Promise<OvertimeRates> {
  const value = (await db.appSetting.findUnique({ where: { key: OVERTIME_RATE_KEY } }))?.value;
  // Format awal (satu angka untuk semua hari) dipakai untuk keduanya.
  if (typeof value === "number") return { weekday: positiveInt(value), weekend: positiveInt(value) };
  const rates = value as Partial<OvertimeRates> | null | undefined;
  return { weekday: positiveInt(rates?.weekday), weekend: positiveInt(rates?.weekend) };
}

export async function saveOvertimeRates(db: PrismaClient, actorId: string, rates: OvertimeRates) {
  return db.$transaction(async (tx) => {
    const before = await getOvertimeRates(tx);
    const value = { weekday: rates.weekday, weekend: rates.weekend };
    await tx.appSetting.upsert({ where: { key: OVERTIME_RATE_KEY }, create: { key: OVERTIME_RATE_KEY, value }, update: { value } });
    await logAudit(tx, { actorId, action: "UPDATE", entity: "AppSetting", entityId: OVERTIME_RATE_KEY, before, after: value });
  });
}

/** Hari kerja (bukan Sabtu/Minggu/libur) untuk tiap tanggal overtime → menentukan tarif weekday/weekend. */
export async function overtimeWorkdays(db: Tx | PrismaClient, dates: Date[]): Promise<(date: Date) => boolean> {
  const holidays = dates.length ? await db.holiday.findMany({ where: { date: { in: dates }, deletedAt: null }, select: { date: true } }) : [];
  const set = new Set(holidays.map((h) => toJakartaIsoDate(h.date)));
  return (date) => isWorkday(toJakartaIsoDate(date), set);
}

/** Nominal satu sesi selesai; null = tarif untuk jenis harinya belum diatur. */
export function overtimeSessionAmount(rates: OvertimeRates, workday: boolean, clockIn: Date, clockOut: Date): number | null {
  const rate = overtimeRateFor(rates, workday);
  return rate ? overtimeAmount(overtimeMinutes(clockIn, clockOut), rate) : null;
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

async function getOwnOpenOvertime(tx: Tx, actor: Actor, overtimeId: string) {
  const overtime = await tx.overtime.findUnique({ where: { id: overtimeId } });
  if (!overtime || overtime.employeeId !== actor.employeeId) throw new ServiceError("Overtime tidak ditemukan");
  if (overtime.clockOut) throw new ServiceError("Overtime ini sudah selesai");
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

/** Clock out + finalize: customer (master) dan project aktif milik customer itu wajib, pekerjaan wajib. */
export async function finishOvertime(db: PrismaClient, actor: Actor, overtimeId: string, input: OvertimeFinishInput, now = new Date()) {
  return db.$transaction(async (tx) => {
    await requireOvertimeEmployee(tx, actor);
    const before = await getOwnOpenOvertime(tx, actor, overtimeId);
    const customer = await tx.customer.findUnique({ where: { id: input.customerId, deletedAt: null } });
    if (!customer) throw new ServiceError("Customer tidak ditemukan di master", "customerId");
    const project = await tx.project.findUnique({ where: { id: input.projectId } });
    if (!project?.isActive) throw new ServiceError("Project tidak ditemukan atau sudah tidak aktif", "projectId");
    if (project.customerId !== customer.id) throw new ServiceError(`Project bukan milik ${customer.name}`, "projectId");

    // Bersyarat: dua klik bersamaan tidak menimpa jam clock out pertama.
    const { count } = await tx.overtime.updateMany({
      where: { id: before.id, clockOut: null },
      data: { clockOut: now, customerId: customer.id, projectId: project.id, activity: input.activity },
    });
    if (count === 0) throw new ServiceError("Overtime ini sudah selesai");
    const after = await tx.overtime.findUniqueOrThrow({ where: { id: before.id } });
    await logAudit(tx, { actorId: actor.id, action: "UPDATE", entity: "Overtime", entityId: before.id, before, after });
    return after;
  });
}

/** Batalkan sesi yang masih berjalan (salah tekan Clock In). Sesi yang sudah selesai tidak bisa dibatalkan. */
export async function cancelOvertime(db: PrismaClient, actor: Actor, overtimeId: string) {
  return db.$transaction(async (tx) => {
    const before = await getOwnOpenOvertime(tx, actor, overtimeId);
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
 * Baris reimburse dari overtime yang dipilih: sesi milik pemohon, sudah selesai, dan belum dipakai reimburse lain
 * (`reimbursementId` = reimburse yang sedang diubah, boleh dipakai ulang). Isi baris diambil dari data overtime,
 * nominal = durasi × tarif per jam saat ini (weekday / weekend & libur) — nilai dari client tidak dipercaya.
 */
export async function overtimeReimbursementItems(tx: Tx, employeeId: string, overtimeIds: string[], reimbursementId: string | null) {
  if (overtimeIds.length === 0) return [];
  if (new Set(overtimeIds).size !== overtimeIds.length) throw new ServiceError("Overtime yang sama dipilih lebih dari sekali");
  const rates = await getOvertimeRates(tx);
  const type = await overtimeReimburseType(tx);
  const overtimes = await tx.overtime.findMany({
    where: { id: { in: overtimeIds } },
    include: { customer: { select: { name: true } }, reimbursementItem: { select: { reimbursementId: true, reimbursement: { select: { number: true } } } } },
    orderBy: { clockIn: "asc" },
  });
  if (overtimes.length !== overtimeIds.length || overtimes.some((o) => o.employeeId !== employeeId)) throw new ServiceError("Overtime tidak ditemukan");
  const workday = await overtimeWorkdays(tx, overtimes.map((o) => o.date));
  return overtimes.map((overtime) => {
    if (!overtime.clockOut || !overtime.customerId || !overtime.activity) throw new ServiceError("Overtime yang belum selesai tidak bisa di-reimburse");
    const usedBy = overtime.reimbursementItem;
    if (usedBy && usedBy.reimbursementId !== reimbursementId) {
      const where = usedBy.reimbursement.number.startsWith("DRAFT-") ? "draft reimburse lain" : `reimburse ${usedBy.reimbursement.number}`;
      throw new ServiceError(`Overtime ${toJakartaIsoDate(overtime.clockIn)} sudah dipakai di ${where}`);
    }
    const amount = overtimeSessionAmount(rates, workday(overtime.date), overtime.clockIn, overtime.clockOut);
    if (amount === null) {
      throw new ServiceError(`Tarif overtime ${workday(overtime.date) ? "weekday" : "weekend/libur"} per jam belum diatur Admin (Setting → Jam Kerja & Absensi)`);
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
      amount: BigInt(amount),
      overtimeId: overtime.id,
    };
  });
}
