// Query Dashboard (docs/04-MAPPING-MENU.md): Admin = ringkasan semua data + antrian approval
// sendiri; Staf = status pengajuan, saldo cuti, sisa plafon, reminder. Hasil aman untuk client.
import type { PrismaClient } from "@/generated/prisma/client";
import { daysUntil, EXPIRY_WARNING_DAYS } from "@/lib/certificate-status";
import { FEATURES } from "@/lib/features";
import { fromIsoDate, toJakartaIsoDate } from "@/lib/format";
import { CERTIFICATE_TYPE_LABEL } from "@/lib/labels";
import { addDays } from "@/lib/leave";
import { listMyApprovalQueue, listMyRequests } from "./approval-queries";
import { getEmployeeCertificates, getEmployeeDocuments, listEmployees } from "./employee-queries";
import { getHealthSummary } from "./health-queries";
import { getCurrentBalances } from "./leave-queries";

export type ExpiringItem = {
  key: string;
  label: string;
  name: string;
  detail: string;
  dueDate: string;
  daysLeft: number;
  href: string;
};

export type WeekEvent =
  | { kind: "leave"; key: string; employeeName: string; startDate: string; endDate: string; workingDays: number; isDirector: boolean }
  | { kind: "holiday"; key: string; name: string; date: string };

/** Senin–Minggu pekan berjalan (kalender Jakarta). */
export function weekRange(todayIso: string) {
  const weekday = new Date(`${todayIso}T00:00:00Z`).getUTCDay(); // 0 = Minggu
  const start = addDays(todayIso, -((weekday + 6) % 7));
  return { start, end: addDays(start, 6) };
}

async function expiringItems(db: PrismaClient, todayIso: string): Promise<ExpiringItem[]> {
  const range = { gte: fromIsoDate(todayIso), lte: fromIsoDate(addDays(todayIso, EXPIRY_WARNING_DAYS)) };
  const [certificates, assets] = await Promise.all([
    db.certificate.findMany({
      where: { endDate: range, deletedAt: null, employee: { status: "ACTIVE" } },
      include: { employee: { select: { id: true, fullName: true } } },
    }),
    FEATURES.inventory ? db.asset.findMany({ where: { deletedAt: null, OR: [{ supportEnd: range }, { warrantyEnd: range }] } }) : [],
  ]);
  const inRange = (d: Date | null): d is Date => d !== null && d >= range.gte && d <= range.lte;
  const items: ExpiringItem[] = certificates.map((c) => {
    const due = toJakartaIsoDate(c.endDate as Date);
    return {
      key: `cert-${c.id}`,
      label: CERTIFICATE_TYPE_LABEL[c.type],
      name: c.name,
      detail: c.employee.fullName,
      dueDate: due,
      daysLeft: daysUntil(due, todayIso),
      href: `/karyawan/${c.employee.id}?tab=sertifikat`,
    };
  });
  for (const a of assets) {
    for (const [label, date, key] of [
      ["Support unit", a.supportEnd, "support"],
      ["Garansi unit", a.warrantyEnd, "warranty"],
    ] as const) {
      if (!inRange(date)) continue;
      const due = toJakartaIsoDate(date);
      items.push({ key: `${key}-${a.id}`, label, name: a.deviceName, detail: a.serialNo, dueDate: due, daysLeft: daysUntil(due, todayIso), href: `/inventory/${a.id}` });
    }
  }
  return items.sort((x, y) => x.dueDate.localeCompare(y.dueDate));
}

/**
 * Libur & cuti pekan ini. Admin melihat cuti semua karyawan; Staf hanya cuti Direktur (blok
 * "Direktur cuti", v1.14 BR-CUT-11) dan cutinya sendiri.
 */
async function weekEvents(db: PrismaClient, todayIso: string, staffEmployeeId?: string | null): Promise<{ start: string; end: string; events: WeekEvent[] }> {
  const { start, end } = weekRange(todayIso);
  // Keputusan user 2026-10-02: semua karyawan melihat cuti semua karyawan (parameter staf tidak lagi membatasi).
  void staffEmployeeId;
  const visibility = {};
  const [leaves, holidays] = await Promise.all([
    db.leaveRequest.findMany({
      where: { status: "APPROVED", startDate: { lte: fromIsoDate(end) }, endDate: { gte: fromIsoDate(start) }, ...visibility },
      include: { employee: { select: { fullName: true, division: true } } },
      orderBy: { startDate: "asc" },
    }),
    db.holiday.findMany({ where: { deletedAt: null, date: { gte: fromIsoDate(start), lte: fromIsoDate(end) } }, orderBy: { date: "asc" } }),
  ]);
  const events: WeekEvent[] = [
    ...leaves.map((l) => ({
      kind: "leave" as const,
      key: l.id,
      employeeName: l.employee.fullName,
      startDate: toJakartaIsoDate(l.startDate),
      endDate: toJakartaIsoDate(l.endDate),
      workingDays: l.workingDays,
      isDirector: l.employee.division === "DIRECTOR",
    })),
    ...holidays.map((h) => ({ kind: "holiday" as const, key: h.id, name: h.name, date: toJakartaIsoDate(h.date) })),
  ];
  const sortKey = (e: WeekEvent) => (e.kind === "leave" ? (e.startDate < start ? start : e.startDate) : e.date);
  return { start, end, events: events.sort((x, y) => sortKey(x).localeCompare(sortKey(y))) };
}

export async function getAdminDashboard(db: PrismaClient, userId: string, todayIso = toJakartaIsoDate()) {
  const month = todayIso.slice(0, 7);
  const [employees, joinedThisMonth, queue, pendingAll, activeProjects, assetTotal, assetAssigned, expiring, week] = await Promise.all([
    listEmployees(db, "ACTIVE"),
    db.employee.count({
      where: {
        status: "ACTIVE",
        periods: { some: { endDate: null, startDate: { gte: fromIsoDate(`${month}-01`), lte: fromIsoDate(todayIso) } } },
      },
    }),
    listMyApprovalQueue(db, userId),
    db.approvalRequest.count({ where: { status: "PENDING" } }),
    db.project.count({ where: { isActive: true } }),
    FEATURES.inventory ? db.asset.count({ where: { deletedAt: null } }) : 0,
    FEATURES.inventory ? db.asset.count({ where: { deletedAt: null, assignments: { some: { returnedAt: null } } } }) : 0,
    expiringItems(db, todayIso),
    weekEvents(db, todayIso),
  ]);
  return {
    employees: {
      active: employees.length,
      joinedThisMonth,
      incompleteDocuments: employees.filter((e) => e.documentPercent < 100).length,
      incompleteProfile: employees.filter((e) => e.profilePercent < 100).length,
    },
    queue,
    pendingAll,
    activeProjects,
    /** null = modul Inventory ditunda. */
    assets: FEATURES.inventory ? { total: assetTotal, assigned: assetAssigned } : null,
    expiring,
    week,
  };
}
export type AdminDashboard = Awaited<ReturnType<typeof getAdminDashboard>>;

export async function getStaffDashboard(db: PrismaClient, user: { id: string; employeeId: string | null }, todayIso = toJakartaIsoDate()) {
  const requests = await listMyRequests(db, user.id);
  if (!user.employeeId) return { requests, balance: null, health: null, certificates: [], documentMissing: [], week: await weekEvents(db, todayIso, null) };
  const [balances, health, certificates, documents, week] = await Promise.all([
    getCurrentBalances(db, [user.employeeId]),
    getHealthSummary(db, user.employeeId),
    getEmployeeCertificates(db, user.employeeId),
    getEmployeeDocuments(db, user.employeeId),
    weekEvents(db, todayIso, user.employeeId),
  ]);
  return {
    requests,
    balance: balances[0] ?? null,
    health,
    /** Reminder: sertifikat yang akan / sudah kadaluarsa. */
    certificates: certificates.filter((c) => c.status === "EXPIRING" || c.status === "EXPIRED"),
    documentMissing: documents?.completeness.missing ?? [],
    week,
  };
}
export type StaffDashboard = Awaited<ReturnType<typeof getStaffDashboard>>;
