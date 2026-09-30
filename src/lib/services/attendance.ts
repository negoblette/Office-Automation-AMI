// Absensi clock in / clock out (keputusan user 2026-09-25). Jam selalu dari server (bukan dari
// browser) supaya tidak bisa dimanipulasi; tanggal & jam dihitung di zona Asia/Jakarta.
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { DEFAULT_WORK_HOURS, earlyLeaveMinutes, isWorkday, jakartaDateTime, lateMinutes, type WorkHours } from "@/lib/attendance";
import { fromIsoDate, toJakartaIsoDate } from "@/lib/format";
import type { AttendanceCorrectionInput, WorkHoursInput } from "@/lib/validators/attendance";
import type { Actor } from "./access";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";

type Tx = Prisma.TransactionClient;

export const WORK_HOURS_KEY = "attendance.workHours";

export async function getWorkHours(db: Tx | PrismaClient): Promise<WorkHours> {
  const setting = await db.appSetting.findUnique({ where: { key: WORK_HOURS_KEY } });
  const value = setting?.value as Partial<WorkHours> | null;
  return value?.workStart && value?.workEnd ? { workStart: value.workStart, workEnd: value.workEnd } : DEFAULT_WORK_HOURS;
}

export async function saveWorkHours(db: PrismaClient, actorId: string, input: WorkHoursInput) {
  return db.$transaction(async (tx) => {
    const before = await getWorkHours(tx);
    await tx.appSetting.upsert({ where: { key: WORK_HOURS_KEY }, create: { key: WORK_HOURS_KEY, value: input }, update: { value: input } });
    await logAudit(tx, { actorId, action: "UPDATE", entity: "AppSetting", entityId: WORK_HOURS_KEY, before, after: input });
  });
}

async function isWorkdayAt(tx: Tx, dateIso: string) {
  const holiday = await tx.holiday.findUnique({ where: { date: fromIsoDate(dateIso) } });
  return isWorkday(dateIso, new Set(holiday && !holiday.deletedAt ? [dateIso] : []));
}

async function requireActiveEmployee(tx: Tx, actor: Actor) {
  if (!actor.employeeId) throw new ServiceError("Akun Anda belum terhubung ke data karyawan. Hubungi Admin.");
  const employee = await tx.employee.findUnique({ where: { id: actor.employeeId }, select: { status: true } });
  if (employee?.status !== "ACTIVE") throw new ServiceError("Hanya karyawan aktif yang bisa absen");
  return actor.employeeId;
}

/** Clock in: sekali per hari; jam = waktu server. */
export async function clockIn(db: PrismaClient, actor: Actor, now = new Date()) {
  return db.$transaction(async (tx) => {
    const employeeId = await requireActiveEmployee(tx, actor);
    const dateIso = toJakartaIsoDate(now);
    const existing = await tx.attendance.findUnique({ where: { employeeId_date: { employeeId, date: fromIsoDate(dateIso) } } });
    if (existing) throw new ServiceError("Anda sudah clock in hari ini");
    const [hours, workday] = await Promise.all([getWorkHours(tx), isWorkdayAt(tx, dateIso)]);
    const record = await tx.attendance.create({
      data: { employeeId, date: fromIsoDate(dateIso), clockIn: now, lateMinutes: lateMinutes(now, hours, workday) },
    });
    await logAudit(tx, { actorId: actor.id, action: "CREATE", entity: "Attendance", entityId: record.id, after: record });
    return record;
  });
}

/** Clock out: untuk absen hari ini yang belum clock out; sekali saja. */
export async function clockOut(db: PrismaClient, actor: Actor, now = new Date()) {
  return db.$transaction(async (tx) => {
    const employeeId = await requireActiveEmployee(tx, actor);
    const dateIso = toJakartaIsoDate(now);
    const record = await tx.attendance.findUnique({ where: { employeeId_date: { employeeId, date: fromIsoDate(dateIso) } } });
    if (!record) throw new ServiceError("Anda belum clock in hari ini");
    if (record.clockOut) throw new ServiceError("Anda sudah clock out hari ini");
    const [hours, workday] = await Promise.all([getWorkHours(tx), isWorkdayAt(tx, dateIso)]);
    // Update bersyarat: dua klik bersamaan tidak menimpa jam clock out pertama.
    const { count } = await tx.attendance.updateMany({
      where: { id: record.id, clockOut: null },
      data: { clockOut: now, earlyLeaveMinutes: earlyLeaveMinutes(now, dateIso, hours, workday) },
    });
    if (count === 0) throw new ServiceError("Anda sudah clock out hari ini");
    const after = await tx.attendance.findUniqueOrThrow({ where: { id: record.id } });
    await logAudit(tx, { actorId: actor.id, action: "UPDATE", entity: "Attendance", entityId: record.id, before: record, after });
    return after;
  });
}

/**
 * Koreksi Admin (lupa clock in/out, salah absen): buat atau ubah absen karyawan di tanggal
 * tertentu. Terlambat / pulang cepat dihitung ulang dengan jam kerja saat ini. Alasan wajib.
 */
export async function correctAttendance(db: PrismaClient, actorId: string, employeeId: string, input: AttendanceCorrectionInput) {
  return db.$transaction(async (tx) => {
    const employee = await tx.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
    if (!employee) throw new ServiceError("Karyawan tidak ditemukan");
    if (input.date > toJakartaIsoDate()) throw new ServiceError("Tidak bisa mengoreksi tanggal yang akan datang", "date");
    const period = await tx.employmentPeriod.findFirst({
      where: { employeeId, startDate: { lte: fromIsoDate(input.date) }, OR: [{ endDate: null }, { endDate: { gte: fromIsoDate(input.date) } }] },
    });
    if (!period) throw new ServiceError("Tanggal di luar periode kerja karyawan", "date");

    const [hours, workday] = await Promise.all([getWorkHours(tx), isWorkdayAt(tx, input.date)]);
    const clockInAt = jakartaDateTime(input.date, input.clockIn);
    const clockOutAt = input.clockOut ? jakartaDateTime(input.date, input.clockOut) : null;
    const data = {
      clockIn: clockInAt,
      clockOut: clockOutAt,
      lateMinutes: lateMinutes(clockInAt, hours, workday),
      earlyLeaveMinutes: earlyLeaveMinutes(clockOutAt, input.date, hours, workday),
      correctedById: actorId,
      correctedAt: new Date(),
      correctionNote: input.note,
    };
    const where = { employeeId_date: { employeeId, date: fromIsoDate(input.date) } };
    const before = await tx.attendance.findUnique({ where });
    const after = await tx.attendance.upsert({ where, create: { employeeId, date: fromIsoDate(input.date), ...data }, update: data });
    await logAudit(tx, { actorId, action: before ? "UPDATE" : "CREATE", entity: "Attendance", entityId: after.id, before, after });
    return after;
  });
}
