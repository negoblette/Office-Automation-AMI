// Query halaman Absensi & kartu dashboard. Hasil aman dikirim ke Client Component (tanpa Date).
import type { PrismaClient } from "@/generated/prisma/client";
import { appealDeadline, type DayStatus, dayStatus, type WorkHours } from "@/lib/attendance";
import { formatTime, fromIsoDate, toJakartaIsoDate } from "@/lib/format";
import { addDays } from "@/lib/leave";
import { getWorkHours } from "./attendance";

export type AttendanceDay = {
  date: string;
  status: DayStatus;
  clockIn: string | null; // "HH:MM"
  clockOut: string | null;
  /** Tanggal clock out bila berbeda hari (lewat tengah malam). */
  clockOutDate: string | null;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  workedMinutes: number | null;
  correctionNote: string | null;
  correctedBy: string | null;
  /** Appeal hari itu (Fase 14). */
  appeal: { number: string; reason: "SICK" | "VISIT"; status: string; note: string } | null;
  /** Saldo cuti sudah dipotong karena tidak hadir tanpa appeal. */
  leaveDeducted: boolean;
  /** Masih boleh mengajukan appeal (tidak hadir, ≤ 7 hari). */
  canAppeal: boolean;
  /** Batas appeal (YYYY-MM-DD) untuk hari tidak hadir. */
  appealDeadline: string | null;
};

export type TodayAttendance = {
  date: string;
  hours: WorkHours;
  clockIn: string | null;
  clockOut: string | null;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  canClockIn: boolean;
  canClockOut: boolean;
};

type AttendanceRow = {
  date: Date;
  clockIn: Date;
  clockOut: Date | null;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  correctionNote: string | null;
  correctedBy?: { employee: { fullName: string } | null; email: string } | null;
};

/** `YYYY-MM` → hari pertama & terakhir bulan itu. */
export function monthRange(yearMonth: string) {
  const [y, m] = yearMonth.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${yearMonth}-01`, end: `${yearMonth}-${String(last).padStart(2, "0")}` };
}

type DayExtras = { appeal?: AttendanceDay["appeal"]; deducted?: boolean; todayIso?: string };

function toDay(dateIso: string, status: DayStatus, row: AttendanceRow | undefined, extras: DayExtras = {}): AttendanceDay {
  const deadline = status === "ABSENT" ? appealDeadline(dateIso) : null;
  return {
    date: dateIso,
    status,
    clockIn: row ? formatTime(row.clockIn) : null,
    clockOut: row?.clockOut ? formatTime(row.clockOut) : null,
    clockOutDate: row?.clockOut && toJakartaIsoDate(row.clockOut) !== dateIso ? toJakartaIsoDate(row.clockOut) : null,
    lateMinutes: row?.lateMinutes ?? 0,
    earlyLeaveMinutes: row?.earlyLeaveMinutes ?? 0,
    workedMinutes: row?.clockOut ? Math.floor((row.clockOut.getTime() - row.clockIn.getTime()) / 60000) : null,
    correctionNote: row?.correctionNote ?? null,
    correctedBy: row?.correctedBy ? (row.correctedBy.employee?.fullName ?? row.correctedBy.email) : null,
    appeal: extras.appeal ?? null,
    leaveDeducted: extras.deducted ?? false,
    canAppeal: Boolean(deadline && extras.todayIso && extras.todayIso <= deadline && !extras.deducted),
    appealDeadline: deadline,
  };
}

/** Data pendukung rekap untuk rentang tanggal: absen, cuti disetujui, libur, periode kerja. */
async function loadRange(db: PrismaClient, employeeIds: string[], start: string, end: string) {
  const range = { gte: fromIsoDate(start), lte: fromIsoDate(end) };
  const [attendances, leaves, holidays, periods, appeals, deductions] = await Promise.all([
    db.attendance.findMany({
      where: { employeeId: { in: employeeIds }, date: range },
      include: { correctedBy: { select: { email: true, employee: { select: { fullName: true } } } } },
    }),
    db.leaveRequest.findMany({
      where: { employeeId: { in: employeeIds }, status: "APPROVED", startDate: { lte: fromIsoDate(end) }, endDate: { gte: fromIsoDate(start) } },
      select: { employeeId: true, startDate: true, endDate: true },
    }),
    db.holiday.findMany({ where: { date: range, deletedAt: null }, select: { date: true } }),
    db.employmentPeriod.findMany({ where: { employeeId: { in: employeeIds } }, select: { employeeId: true, startDate: true, endDate: true } }),
    db.attendanceAppeal.findMany({
      where: { employeeId: { in: employeeIds }, date: range, status: { in: ["PENDING", "APPROVED"] } },
      select: { employeeId: true, date: true, number: true, reason: true, status: true, note: true },
    }),
    db.leaveAdjustment.findMany({
      where: { employeeId: { in: employeeIds }, source: "ABSENCE", attendanceDate: range },
      select: { employeeId: true, attendanceDate: true },
    }),
  ]);
  const appealOf = new Map(appeals.map((a) => [`${a.employeeId}|${toJakartaIsoDate(a.date)}`, { number: a.number, reason: a.reason, status: a.status, note: a.note }]));
  const deductedSet = new Set(deductions.map((d) => `${d.employeeId}|${toJakartaIsoDate(d.attendanceDate!)}`));
  const holidaySet = new Set(holidays.map((h) => toJakartaIsoDate(h.date)));
  const recordOf = new Map(attendances.map((a) => [`${a.employeeId}|${toJakartaIsoDate(a.date)}`, a]));
  const onLeave = (employeeId: string, dateIso: string) =>
    leaves.some((l) => l.employeeId === employeeId && toJakartaIsoDate(l.startDate) <= dateIso && toJakartaIsoDate(l.endDate) >= dateIso);
  const employed = (employeeId: string, dateIso: string) =>
    periods.some(
      (p) => p.employeeId === employeeId && toJakartaIsoDate(p.startDate) <= dateIso && (!p.endDate || toJakartaIsoDate(p.endDate) >= dateIso),
    );
  return { holidaySet, recordOf, onLeave, employed, appealOf, deductedSet };
}

/** Riwayat per hari satu karyawan dalam satu bulan (sampai hari ini). */
export async function listMonthDays(db: PrismaClient, employeeId: string, yearMonth: string, todayIso = toJakartaIsoDate()): Promise<AttendanceDay[]> {
  const { start, end } = monthRange(yearMonth);
  const last = end < todayIso ? end : todayIso;
  if (last < start) return [];
  const data = await loadRange(db, [employeeId], start, last);
  const days: AttendanceDay[] = [];
  for (let dateIso = last; dateIso >= start; dateIso = addDays(dateIso, -1)) {
    const key = `${employeeId}|${dateIso}`;
    const row = data.recordOf.get(key);
    const appeal = data.appealOf.get(key) ?? null;
    const status = dayStatus({
      dateIso,
      todayIso,
      employed: data.employed(employeeId, dateIso),
      record: row ?? null,
      onLeave: data.onLeave(employeeId, dateIso),
      holiday: data.holidaySet.has(dateIso),
      appeal,
    });
    if (status !== "NOT_EMPLOYED") days.push(toDay(dateIso, status, row, { appeal, deducted: data.deductedSet.has(key), todayIso }));
  }
  return days;
}

export async function getTodayAttendance(db: PrismaClient, employeeId: string, now = new Date()): Promise<TodayAttendance> {
  const dateIso = toJakartaIsoDate(now);
  const [row, hours] = await Promise.all([
    db.attendance.findUnique({ where: { employeeId_date: { employeeId, date: fromIsoDate(dateIso) } } }),
    getWorkHours(db),
  ]);
  return {
    date: dateIso,
    hours,
    clockIn: row ? formatTime(row.clockIn) : null,
    clockOut: row?.clockOut ? formatTime(row.clockOut) : null,
    lateMinutes: row?.lateMinutes ?? 0,
    earlyLeaveMinutes: row?.earlyLeaveMinutes ?? 0,
    canClockIn: !row,
    canClockOut: Boolean(row && !row.clockOut),
  };
}

export type AttendanceSummaryRow = {
  employeeId: string;
  name: string;
  position: string;
  division: string;
  present: number;
  late: number;
  noClockOut: number;
  leave: number;
  absent: number;
  /** Appeal disetujui (Fase 14). */
  sick: number;
  visit: number;
  /** Hari yang sudah dipotong cuti. */
  deducted: number;
  lateMinutes: number;
  /** Status hari ini (hanya bila bulan berjalan). */
  today: AttendanceDay | null;
};

/** Rekap bulanan semua karyawan aktif (Admin). */
export async function monthSummary(db: PrismaClient, yearMonth: string, todayIso = toJakartaIsoDate()): Promise<AttendanceSummaryRow[]> {
  const employees = await db.employee.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, fullName: true, position: true, division: true },
    orderBy: { fullName: "asc" },
  });
  const { start, end } = monthRange(yearMonth);
  const last = end < todayIso ? end : todayIso;
  const data = last >= start ? await loadRange(db, employees.map((e) => e.id), start, last) : null;

  return employees.map((employee) => {
    const row: AttendanceSummaryRow = {
      employeeId: employee.id,
      name: employee.fullName,
      position: employee.position,
      division: employee.division,
      present: 0,
      late: 0,
      noClockOut: 0,
      leave: 0,
      absent: 0,
      sick: 0,
      visit: 0,
      deducted: 0,
      lateMinutes: 0,
      today: null,
    };
    if (!data) return row;
    for (let dateIso = start; dateIso <= last; dateIso = addDays(dateIso, 1)) {
      const key = `${employee.id}|${dateIso}`;
      const record = data.recordOf.get(key);
      const appeal = data.appealOf.get(key) ?? null;
      const status = dayStatus({
        dateIso,
        todayIso,
        employed: data.employed(employee.id, dateIso),
        record: record ?? null,
        onLeave: data.onLeave(employee.id, dateIso),
        holiday: data.holidaySet.has(dateIso),
        appeal,
      });
      if (status === "SICK") row.sick++;
      if (status === "VISIT") row.visit++;
      if (data.deductedSet.has(key)) row.deducted++;
      if (record) row.present++;
      if (record && record.lateMinutes > 0) row.late++;
      if (status === "NO_CLOCK_OUT") row.noClockOut++;
      if (status === "LEAVE") row.leave++;
      if (status === "ABSENT") row.absent++;
      row.lateMinutes += record?.lateMinutes ?? 0;
      if (dateIso === todayIso) row.today = toDay(dateIso, status, record, { appeal, todayIso });
    }
    return row;
  });
}
