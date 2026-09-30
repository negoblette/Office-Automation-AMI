// Query halaman Cuti. Saldo periode berjalan dibuat otomatis bila belum ada (ensureLeaveBalance).
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

/** Staf: miliknya sendiri; Admin: semua. */
export async function listLeaveRequests(db: PrismaClient, viewer: { role: "ADMIN" | "STAFF"; employeeId: string | null }) {
  const requests = await db.leaveRequest.findMany({
    where: viewer.role === "ADMIN" ? {} : { employeeId: viewer.employeeId ?? "__none__" },
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
