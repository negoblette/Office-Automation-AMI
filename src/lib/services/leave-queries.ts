// Query halaman Cuti. Saldo periode berjalan dibuat otomatis bila belum ada (ensureLeaveBalance).
import type { Role } from "@/generated/prisma/enums";
import type { PrismaClient, RequestStatus } from "@/generated/prisma/client";
import { fromIsoDate, toJakartaIsoDate } from "@/lib/format";
import { addDays, firstUsableDate, leaveYear, remainingDays } from "@/lib/leave";
import { currentEmploymentStart, ensureLeaveBalance, getMaxCarryOver } from "./leave-balance";

export type LeaveBalanceView = {
  employeeId: string;
  employeeName: string;
  employeePosition: string;
  periodStart: string;
  periodEnd: string;
  /** Tanggal mulai boleh cuti tahun ini; null = belum genap 1 tahun sampai akhir tahun. */
  eligibleFrom: string | null;
  /** Tanggal pertama cuti bisa dipakai (untuk pesan "bisa dipakai mulai …"). */
  firstEligibleDate: string;
  entitlement: number;
  carriedOver: number;
  used: number;
  /** Penyesuaian Admin / potong cuti (Fase 14). */
  adjustment: number;
  pending: number;
  remaining: number;
};

/** Saldo periode berjalan (hari ini) untuk karyawan-karyawan tertentu (LV-07). */
export async function getCurrentBalances(db: PrismaClient, employeeIds: string[]): Promise<LeaveBalanceView[]> {
  const today = toJakartaIsoDate();
  const result: LeaveBalanceView[] = [];
  for (const employeeId of employeeIds) {
    const [balance, employmentStart] = await db.$transaction(async (tx) => [
      await ensureLeaveBalance(tx, employeeId, today),
      await currentEmploymentStart(tx, employeeId),
    ] as const);
    const year = leaveYear(employmentStart, today);
    const [employee, pending] = await Promise.all([
      db.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { fullName: true, position: true } }),
      db.leaveRequest.aggregate({
        _sum: { workingDays: true },
        where: { employeeId, status: "PENDING", startDate: { gte: balance.periodStart, lte: balance.periodEnd } },
      }),
    ]);
    const pendingDays = pending._sum.workingDays ?? 0;
    result.push({
      employeeId,
      employeeName: employee.fullName,
      employeePosition: employee.position,
      periodStart: toJakartaIsoDate(balance.periodStart),
      periodEnd: toJakartaIsoDate(balance.periodEnd),
      eligibleFrom: year.eligibleFrom,
      firstEligibleDate: firstUsableDate(employmentStart),
      entitlement: balance.entitlement,
      carriedOver: balance.carriedOver,
      used: balance.used,
      adjustment: balance.adjustment,
      pending: pendingDays,
      remaining: remainingDays(balance, pendingDays),
    });
  }
  return result;
}

export async function getAllCurrentBalances(db: PrismaClient) {
  const employees = await db.employee.findMany({ where: { status: "ACTIVE" }, orderBy: { fullName: "asc" }, select: { id: true } });
  return getCurrentBalances(db, employees.map((e) => e.id));
}

export type LeaveRequestRow = {
  id: string;
  number: string;
  employeeName: string;
  employeePosition: string;
  startDate: string;
  endDate: string;
  workingDays: number;
  reason: string;
  status: RequestStatus;
  currentLevel: number | null;
  submittedAt: string | null;
};

/**
 * Staf: miliknya sendiri; Admin: semua. `yearMonth` (Fase 14) = hanya cuti yang beririsan dengan
 * bulan itu (cuti lintas bulan tampil di kedua bulan).
 */
export async function listLeaveRequests(db: PrismaClient, viewer: { role: Role; employeeId: string | null }, yearMonth?: string) {
  const month = yearMonth
    ? (() => {
        const [y, m] = yearMonth.split("-").map(Number);
        return { startDate: { lte: new Date(Date.UTC(y, m, 0)) }, endDate: { gte: new Date(Date.UTC(y, m - 1, 1)) } };
      })()
    : {};
  const requests = await db.leaveRequest.findMany({
    where: { ...(viewer.role === "ADMIN" ? {} : { employeeId: viewer.employeeId ?? "__none__" }), ...month },
    orderBy: { startDate: "desc" },
    include: { employee: { select: { fullName: true, position: true } } },
  });
  const approvals = await db.approvalRequest.findMany({
    where: { module: "LEAVE", entityId: { in: requests.map((r) => r.id) } },
    select: { entityId: true, currentLevel: true },
  });
  const levelOf = new Map(approvals.map((a) => [a.entityId, a.currentLevel]));
  return requests.map<LeaveRequestRow>((request) => ({
    id: request.id,
    number: request.number,
    employeeName: request.employee.fullName,
    employeePosition: request.employee.position,
    startDate: toJakartaIsoDate(request.startDate),
    endDate: toJakartaIsoDate(request.endDate),
    workingDays: request.workingDays,
    reason: request.reason,
    status: request.status,
    currentLevel: levelOf.get(request.id) ?? null,
    submittedAt: request.submittedAt?.toISOString() ?? null,
  }));
}

export type HolidayView = { id: string; date: string; name: string; isNational: boolean };

/** Hari libur dalam rentang (default: 30 hari lalu s/d 13 bulan ke depan untuk pratinjau form). */
export async function listHolidays(db: PrismaClient, fromIso?: string, toIso?: string): Promise<HolidayView[]> {
  const today = toJakartaIsoDate();
  const holidays = await db.holiday.findMany({
    where: { deletedAt: null, date: { gte: fromIsoDate(fromIso ?? addDays(today, -30)), lte: fromIsoDate(toIso ?? addDays(today, 400)) } },
    orderBy: { date: "asc" },
  });
  return holidays.map((h) => ({ id: h.id, date: toJakartaIsoDate(h.date), name: h.name, isNational: h.isNational }));
}

export async function getLeaveSettings(db: PrismaClient) {
  const [policies, maxCarryOver] = await Promise.all([
    db.leavePolicy.findMany({ orderBy: { minYears: "asc" } }),
    db.$transaction((tx) => getMaxCarryOver(tx)),
  ]);
  return { policies: policies.map((p) => ({ minYears: p.minYears, maxYears: p.maxYears, days: p.days })), maxCarryOver };
}

export type DirectorLeaveView = { id: string; employeeName: string; startDate: string; endDate: string; workingDays: number };

/**
 * Cuti divisi Direktur yang sudah tercatat (tanpa approval, v1.14 BR-CUT-11) — tampil sebagai
 * blok "Direktur cuti" di kalender yang bisa dilihat semua karyawan.
 */
export async function listDirectorLeaves(db: PrismaClient, fromIso: string, toIso: string): Promise<DirectorLeaveView[]> {
  const leaves = await db.leaveRequest.findMany({
    where: {
      status: "APPROVED",
      employee: { division: "DIRECTOR" },
      startDate: { lte: fromIsoDate(toIso) },
      endDate: { gte: fromIsoDate(fromIso) },
    },
    include: { employee: { select: { fullName: true } } },
    orderBy: { startDate: "asc" },
  });
  return leaves.map((l) => ({
    id: l.id,
    employeeName: l.employee.fullName,
    startDate: toJakartaIsoDate(l.startDate),
    endDate: toJakartaIsoDate(l.endDate),
    workingDays: l.workingDays,
  }));
}

export type LeaveAdjustmentView = {
  id: string;
  employeeId: string;
  employeeName: string;
  days: number;
  reason: string;
  source: string;
  attendanceDate: string | null;
  createdBy: string | null;
  createdAt: string;
};

/** Riwayat penyesuaian saldo (terbaru dulu). `employeeId` kosong = semua karyawan (Admin). */
export async function listLeaveAdjustments(db: PrismaClient, employeeId?: string, limit = 30): Promise<LeaveAdjustmentView[]> {
  const rows = await db.leaveAdjustment.findMany({
    where: employeeId ? { employeeId } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      balance: { select: { employee: { select: { fullName: true } } } },
      createdBy: { select: { email: true, employee: { select: { fullName: true } } } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    employeeId: r.employeeId,
    employeeName: r.balance.employee.fullName,
    days: r.days,
    reason: r.reason,
    source: r.source,
    attendanceDate: r.attendanceDate ? toJakartaIsoDate(r.attendanceDate) : null,
    createdBy: r.createdBy ? (r.createdBy.employee?.fullName ?? r.createdBy.email) : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export type CalendarDay = {
  date: string;
  inMonth: boolean;
  weekend: boolean;
  holiday: string | null;
  /** Karyawan yang cuti (disetujui) di tanggal ini; Direktur ditandai (BR-CUT-11). */
  leaves: { name: string; isDirector: boolean }[];
};

/**
 * Kalender bulanan cuti & libur (Fase 14): semua karyawan melihat cuti semua karyawan (keputusan
 * user 2026-10-02). Grid Senin–Minggu, termasuk hari dari bulan sebelum/sesudah untuk melengkapi minggu.
 * Cuti hanya ditandai di hari kerja (Sabtu, Minggu, libur tidak dihitung cuti).
 */
export async function getLeaveCalendar(db: PrismaClient, yearMonth: string): Promise<CalendarDay[][]> {
  const [y, m] = yearMonth.split("-").map(Number);
  const first = `${yearMonth}-01`;
  const last = toJakartaIsoDate(new Date(Date.UTC(y, m, 0)));
  const firstWeekday = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = Senin
  const gridStart = addDays(first, -firstWeekday);
  const lastWeekday = (new Date(`${last}T00:00:00Z`).getUTCDay() + 6) % 7;
  const gridEnd = addDays(last, 6 - lastWeekday);

  const [leaves, holidays] = await Promise.all([
    db.leaveRequest.findMany({
      where: { status: "APPROVED", startDate: { lte: fromIsoDate(gridEnd) }, endDate: { gte: fromIsoDate(gridStart) } },
      include: { employee: { select: { fullName: true, division: true } } },
      orderBy: { startDate: "asc" },
    }),
    db.holiday.findMany({ where: { deletedAt: null, date: { gte: fromIsoDate(gridStart), lte: fromIsoDate(gridEnd) } } }),
  ]);
  const holidayOf = new Map(holidays.map((h) => [toJakartaIsoDate(h.date), h.name]));

  const weeks: CalendarDay[][] = [];
  for (let day = gridStart; day <= gridEnd; day = addDays(day, 1)) {
    if ((weeks.at(-1)?.length ?? 7) === 7) weeks.push([]);
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    const holiday = holidayOf.get(day) ?? null;
    weeks.at(-1)!.push({
      date: day,
      inMonth: day.startsWith(yearMonth),
      weekend,
      holiday,
      leaves:
        weekend || holiday
          ? []
          : leaves
              .filter((l) => toJakartaIsoDate(l.startDate) <= day && toJakartaIsoDate(l.endDate) >= day)
              .map((l) => ({ name: l.employee.fullName, isDirector: l.employee.division === "DIRECTOR" })),
    });
  }
  return weeks;
}
