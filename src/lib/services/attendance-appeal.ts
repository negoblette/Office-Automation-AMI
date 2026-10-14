// Appeal absensi & potong cuti otomatis (Fase 14, keputusan user 2026-10-02).
// - Karyawan yang tidak masuk (tidak bisa clock in) mengajukan appeal untuk hari itu: Sakit atau
//   Kunjungan keluar + keterangan, maks 7 hari sejak tanggal tersebut. Approval Bu Ika.
// - Hari kerja tanpa absen, tanpa cuti, tanpa appeal, lewat 7 hari → saldo cuti dipotong 1 hari
//   (LeaveAdjustment ABSENCE, boleh minus). Hanya untuk tanggal mulai fitur aktif.
import type { AppealReason, Prisma, PrismaClient } from "@/generated/prisma/client";
import { APPEAL_REASON_LABEL, appealDeadline, isWorkday } from "@/lib/attendance";
import { formatDate, fromIsoDate, toJakartaIsoDate } from "@/lib/format";
import { addDays } from "@/lib/leave";
import type { Actor } from "./access";
import { type ApprovalNotification, restartApproval } from "./approval";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";
import { addLeaveAdjustment } from "./leave-balance";
import { nextDocumentNumber } from "./numbering";
import { assertFileKeyAvailable } from "./access";

type Tx = Prisma.TransactionClient;

/** Tanggal mulai potong cuti otomatis (AppSetting); dibuat = hari pertama job berjalan. */
export const DEDUCTION_START_KEY = "attendance.deductionStartDate";

export type AppealInput = {
  /** Tanggal mulai. */
  date: string;
  /** Tanggal akhir (opsional, 2026-10-14): satu appeal untuk beberapa hari berturut-turut. */
  endDate?: string | null;
  reason: AppealReason;
  note: string;
  fileKey?: string | null;
  fileName?: string | null;
};

/** Tanggal-tanggal yang dicakup appeal (date … endDate). */
export function appealDates(appeal: { date: Date; endDate: Date | null }): string[] {
  const start = toJakartaIsoDate(appeal.date);
  const end = appeal.endDate ? toJakartaIsoDate(appeal.endDate) : start;
  const dates: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);
  return dates;
}

/** Filter Prisma: appeal yang rentangnya beririsan dengan [start, end]. */
export function appealOverlap(start: Date, end: Date) {
  return { date: { lte: end }, OR: [{ endDate: null, date: { gte: start } }, { endDate: { gte: start } }] };
}

async function isEmployedOn(tx: Tx | PrismaClient, employeeId: string, dateIso: string) {
  const period = await tx.employmentPeriod.findFirst({
    where: { employeeId, startDate: { lte: fromIsoDate(dateIso) }, OR: [{ endDate: null }, { endDate: { gte: fromIsoDate(dateIso) } }] },
  });
  return Boolean(period);
}

async function holidaysBetween(tx: Tx | PrismaClient, start: string, end: string) {
  const rows = await tx.holiday.findMany({ where: { deletedAt: null, date: { gte: fromIsoDate(start), lte: fromIsoDate(end) } }, select: { date: true } });
  return new Set(rows.map((h) => toJakartaIsoDate(h.date)));
}

/**
 * Ajukan appeal untuk satu hari — atau rentang hari berturut-turut (`endDate`, 2026-10-14) — tidak hadir.
 * Sabtu, Minggu & libur dalam rentang dilewati; hari kerja lain harus benar-benar tidak hadir & tidak cuti.
 * Kirim `notifications` setelah commit.
 */
export async function submitAppeal(db: PrismaClient, actor: Actor, input: AppealInput, todayIso = toJakartaIsoDate()) {
  return db.$transaction(async (tx) => {
    const employeeId = actor.employeeId;
    if (!employeeId) throw new ServiceError("Akun Anda belum terhubung ke data karyawan");
    const employee = await tx.employee.findUnique({ where: { id: employeeId }, select: { status: true } });
    if (employee?.status !== "ACTIVE") throw new ServiceError("Hanya karyawan aktif yang bisa mengajukan appeal");

    const date = input.date;
    const end = input.endDate && input.endDate !== date ? input.endDate : date;
    if (end < date) throw new ServiceError("Tanggal akhir tidak boleh sebelum tanggal mulai", "endDate");
    if (end >= todayIso) throw new ServiceError("Appeal hanya untuk hari yang sudah lewat", end === date ? "date" : "endDate");
    if (todayIso > appealDeadline(date)) throw new ServiceError(`Batas appeal untuk ${formatDate(fromIsoDate(date))} sudah lewat (maks 7 hari)`, "date");

    // Hari kerja dalam rentang (Sabtu, Minggu, libur dilewati).
    const holidays = await holidaysBetween(tx, date, end);
    const workdays: string[] = [];
    for (let d = date; d <= end; d = addDays(d, 1)) if (isWorkday(d, holidays)) workdays.push(d);
    if (workdays.length === 0) throw new ServiceError(date === end ? "Tanggal tersebut bukan hari kerja" : "Rentang tanggal tidak berisi hari kerja", "date");
    for (const d of workdays) {
      if (!(await isEmployedOn(tx, employeeId, d))) throw new ServiceError(`${formatDate(fromIsoDate(d))} di luar periode kerja Anda`, "date");
    }
    const clocked = await tx.attendance.findFirst({ where: { employeeId, date: { in: workdays.map(fromIsoDate) } }, orderBy: { date: "asc" } });
    if (clocked) {
      throw new ServiceError(date === end ? "Anda sudah tercatat absen di tanggal tersebut" : `Anda sudah tercatat absen pada ${formatDate(clocked.date)}`, "date");
    }
    const onLeave = await tx.leaveRequest.findFirst({
      where: { employeeId, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: fromIsoDate(end) }, endDate: { gte: fromIsoDate(date) } },
    });
    if (onLeave) throw new ServiceError(`${date === end ? "Tanggal tersebut" : "Rentang tersebut"} sudah tercatat cuti (${onLeave.number})`, "date");
    // Appeal yang ditolak boleh direvisi & diajukan ulang (2026-10-12, OI-05) selama masih dalam batas 7 hari.
    const existing = await tx.attendanceAppeal.findUnique({ where: { employeeId_date: { employeeId, date: fromIsoDate(date) } } });
    if (existing && existing.status !== "REJECTED") throw new ServiceError("Appeal untuk tanggal tersebut sudah pernah diajukan", "date");
    const overlapping = await tx.attendanceAppeal.findFirst({
      where: { employeeId, status: { not: "REJECTED" }, ...(existing ? { id: { not: existing.id } } : {}), ...appealOverlap(fromIsoDate(date), fromIsoDate(end)) },
    });
    if (overlapping) throw new ServiceError(`Sebagian tanggal sudah tercakup appeal ${overlapping.number}`, "date");

    // Bukti sakit WAJIB untuk alasan Sakit (2026-10-14); file harus belum dipakai data lain.
    if (input.reason === "SICK" && !input.fileKey) throw new ServiceError("Surat keterangan sakit wajib diupload", "fileKey");
    const file = input.reason === "SICK" && input.fileKey ? { fileKey: input.fileKey, fileName: input.fileName ?? "surat-sakit.pdf" } : { fileKey: null, fileName: null };
    if (file.fileKey && file.fileKey !== existing?.fileKey) await assertFileKeyAvailable(tx, file.fileKey);

    const number = existing ? existing.number : await nextDocumentNumber(tx, "APL");
    const appeal = existing
      ? await tx.attendanceAppeal.update({
          where: { id: existing.id },
          data: { endDate: end === date ? null : fromIsoDate(end), reason: input.reason, note: input.note, ...file, status: "PENDING", approvedAt: null },
        })
      : await tx.attendanceAppeal.create({
          data: { number, employeeId, date: fromIsoDate(date), endDate: end === date ? null : fromIsoDate(end), reason: input.reason, note: input.note, ...file },
        });
    const approval = await restartApproval(tx, { module: "ATTENDANCE_APPEAL", entityId: appeal.id, entityNumber: number, requesterId: actor.id });
    await logAudit(tx, { actorId: actor.id, action: existing ? "UPDATE" : "CREATE", entity: "AttendanceAppeal", entityId: appeal.id, before: existing, after: appeal });
    return { appealId: appeal.id, number, status: approval.status, notifications: approval.notifications as ApprovalNotification[] };
  });
}

/** Ringkasan appeal untuk antrian approval. */
export function appealSummary(appeal: { date: Date; endDate?: Date | null; reason: AppealReason; note: string; employee: { fullName: string } }) {
  const when = appeal.endDate
    ? `${formatDate(appeal.date, "weekday")} – ${formatDate(appeal.endDate, "weekday")}`
    : formatDate(appeal.date, "weekday");
  return `${APPEAL_REASON_LABEL[appeal.reason]} · ${when} · ${appeal.employee.fullName} — ${appeal.note}`;
}

/**
 * Job harian `attendance.deduct`: untuk tiap karyawan aktif, hari kerja D (≥ tanggal mulai fitur)
 * yang sudah lewat 7 hari tanpa absen, cuti, maupun appeal → potong 1 hari saldo cuti (sekali per D).
 */
export async function deductUnexcusedAbsences(db: PrismaClient, todayIso = toJakartaIsoDate()) {
  let startSetting = await db.appSetting.findUnique({ where: { key: DEDUCTION_START_KEY } });
  if (!startSetting) {
    // Hari pertama fitur aktif: absen sebelum ini tidak pernah dipotong.
    startSetting = await db.appSetting.create({ data: { key: DEDUCTION_START_KEY, value: todayIso } });
  }
  const startIso = String(startSetting.value);
  const lastIso = addDays(todayIso, -(7 + 1)); // D + 7 sudah lewat → D ≤ today − 8
  if (lastIso < startIso) return { deducted: 0 };

  const [employees, holidays] = await Promise.all([
    db.employee.findMany({ where: { status: "ACTIVE" }, select: { id: true, fullName: true } }),
    holidaysBetween(db, startIso, lastIso),
  ]);
  const range = { gte: fromIsoDate(startIso), lte: fromIsoDate(lastIso) };
  let deducted = 0;

  for (const employee of employees) {
    const [attendances, appeals, adjustments, leaves, periods] = await Promise.all([
      db.attendance.findMany({ where: { employeeId: employee.id, date: range }, select: { date: true } }),
      db.attendanceAppeal.findMany({
        where: { employeeId: employee.id, status: { in: ["PENDING", "APPROVED"] }, ...appealOverlap(range.gte, range.lte) },
        select: { date: true, endDate: true },
      }),
      db.leaveAdjustment.findMany({ where: { employeeId: employee.id, source: "ABSENCE", attendanceDate: range }, select: { attendanceDate: true } }),
      db.leaveRequest.findMany({
        where: { employeeId: employee.id, status: "APPROVED", startDate: { lte: range.lte }, endDate: { gte: range.gte } },
        select: { startDate: true, endDate: true },
      }),
      db.employmentPeriod.findMany({ where: { employeeId: employee.id }, select: { startDate: true, endDate: true } }),
    ]);
    const excused = new Set([
      ...attendances.map((a) => toJakartaIsoDate(a.date)),
      ...appeals.flatMap(appealDates),
      ...adjustments.map((a) => toJakartaIsoDate(a.attendanceDate!)),
    ]);
    const onLeave = (d: string) => leaves.some((l) => toJakartaIsoDate(l.startDate) <= d && toJakartaIsoDate(l.endDate) >= d);
    const employed = (d: string) => periods.some((p) => toJakartaIsoDate(p.startDate) <= d && (!p.endDate || toJakartaIsoDate(p.endDate) >= d));

    for (let d = startIso; d <= lastIso; d = addDays(d, 1)) {
      if (excused.has(d) || !isWorkday(d, holidays) || onLeave(d) || !employed(d)) continue;
      await db.$transaction((tx) =>
        addLeaveAdjustment(tx, {
          employeeId: employee.id,
          refIso: d,
          days: -1,
          reason: `Tidak hadir tanpa keterangan ${formatDate(fromIsoDate(d))} (tidak ada appeal dalam 7 hari)`,
          source: "ABSENCE",
          attendanceDate: d,
          createdById: null,
        }),
      );
      deducted++;
    }
  }
  return { deducted };
}
