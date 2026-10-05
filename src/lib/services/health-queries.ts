// Query halaman Kesehatan. Nominal dikonversi ke number — aman dikirim ke client.
import type { Role } from "@/generated/prisma/enums";
import type { PrismaClient, RequestStatus } from "@/generated/prisma/client";
import { fromIsoDate, toJakartaIsoDate } from "@/lib/format";
import { remainingPlafond } from "@/lib/health";

const yearRange = (year: number) => ({ gte: fromIsoDate(`${year}-01-01`), lte: fromIsoDate(`${year}-12-31`) });

export type HealthSummary = {
  year: number;
  annual: number | null;
  approved: number;
  pending: number;
  remaining: number;
  scheduledThisMonth: number;
};

/** Ringkasan plafon karyawan untuk tahun berjalan (kartu di /kesehatan). */
export async function getHealthSummary(db: PrismaClient, employeeId: string): Promise<HealthSummary> {
  const today = toJakartaIsoDate();
  const year = Number(today.slice(0, 4));
  const month = today.slice(0, 7);
  const [plafond, grouped, scheduled] = await Promise.all([
    db.healthPlafond.findUnique({ where: { employeeId_year: { employeeId, year } } }),
    db.healthClaim.groupBy({
      by: ["status"],
      where: { employeeId, status: { in: ["APPROVED", "PENDING"] }, claimDate: yearRange(year) },
      _sum: { amount: true, approvedAmount: true },
    }),
    db.healthPayout.aggregate({ _sum: { amount: true }, where: { employeeId, periodMonth: fromIsoDate(`${month}-01`) } }),
  ]);
  // APPROVED memakai nominal disetujui, PENDING nominal diajukan (v1.14).
  const sumOf = (status: RequestStatus) => {
    const row = grouped.find((g) => g.status === status);
    return Number((status === "APPROVED" ? row?._sum.approvedAmount : row?._sum.amount) ?? 0);
  };
  const approved = sumOf("APPROVED");
  const pending = sumOf("PENDING");
  const annual = plafond ? Number(plafond.annualAmount) : null;
  return {
    year,
    annual,
    approved,
    pending,
    remaining: annual === null ? 0 : remainingPlafond(annual, approved + pending),
    scheduledThisMonth: Number(scheduled._sum.amount ?? 0),
  };
}

export type HealthClaimRow = {
  id: string;
  number: string;
  employeeName: string;
  employeePosition: string;
  categoryName: string;
  claimDate: string;
  amount: number;
  /** Nominal disetujui (null selama belum disetujui). */
  approvedAmount: number | null;
  note: string | null;
  status: RequestStatus;
  currentLevel: number | null;
  payouts: { month: string; amount: number; paid: boolean }[];
};

/** Staf: klaim sendiri; Admin: semua. */
export async function listHealthClaims(db: PrismaClient, viewer: { role: Role; employeeId: string | null }) {
  const claims = await db.healthClaim.findMany({
    where: viewer.role === "ADMIN" ? {} : { employeeId: viewer.employeeId ?? "__none__" },
    orderBy: { createdAt: "desc" },
    include: {
      employee: { select: { fullName: true, position: true } },
      category: { select: { name: true } },
      payouts: { orderBy: { periodMonth: "asc" } },
    },
  });
  const approvals = await db.approvalRequest.findMany({
    where: { module: "HEALTH", entityId: { in: claims.map((c) => c.id) } },
    select: { entityId: true, currentLevel: true },
  });
  const levelOf = new Map(approvals.map((a) => [a.entityId, a.currentLevel]));
  return claims.map<HealthClaimRow>((claim) => ({
    id: claim.id,
    number: claim.number,
    employeeName: claim.employee.fullName,
    employeePosition: claim.employee.position,
    categoryName: claim.category.name,
    claimDate: toJakartaIsoDate(claim.claimDate),
    amount: Number(claim.amount),
    approvedAmount: claim.approvedAmount === null ? null : Number(claim.approvedAmount),
    note: claim.note,
    status: claim.status,
    currentLevel: levelOf.get(claim.id) ?? null,
    payouts: claim.payouts.map((p) => ({ month: toJakartaIsoDate(p.periodMonth).slice(0, 7), amount: Number(p.amount), paid: p.paidAt !== null })),
  }));
}

export type PayoutRow = {
  id: string;
  employeeName: string;
  employeePosition: string;
  claimNumber: string;
  categoryName: string;
  claimAmount: number;
  amount: number;
  paidAt: string | null;
};

/** Jadwal pembayaran satu bulan untuk Finance (/kesehatan/pembayaran). */
export async function listPayoutsForMonth(db: PrismaClient, yearMonth: string): Promise<PayoutRow[]> {
  const payouts = await db.healthPayout.findMany({
    where: { periodMonth: fromIsoDate(`${yearMonth}-01`) },
    include: { claim: { include: { employee: { select: { fullName: true, position: true } }, category: { select: { name: true } } } } },
    orderBy: [{ claim: { employee: { fullName: "asc" } } }, { claim: { number: "asc" } }],
  });
  return payouts.map((p) => ({
    id: p.id,
    employeeName: p.claim.employee.fullName,
    employeePosition: p.claim.employee.position,
    claimNumber: p.claim.number,
    categoryName: p.claim.category.name,
    claimAmount: Number(p.claim.amount),
    amount: Number(p.amount),
    paidAt: p.paidAt?.toISOString() ?? null,
  }));
}

export type PlafondRow = {
  employeeId: string;
  employeeName: string;
  employeePosition: string;
  annual: number | null;
  used: number;
};

/** Plafon semua karyawan aktif untuk satu tahun (/setting/kesehatan). */
export async function listPlafonds(db: PrismaClient, year: number): Promise<PlafondRow[]> {
  const [employees, plafonds, used] = await Promise.all([
    db.employee.findMany({ where: { status: "ACTIVE" }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, position: true } }),
    db.healthPlafond.findMany({ where: { year } }),
    db.healthClaim.groupBy({
      by: ["employeeId", "status"],
      where: { status: { in: ["APPROVED", "PENDING"] }, claimDate: yearRange(year) },
      _sum: { amount: true, approvedAmount: true },
    }),
  ]);
  const plafondOf = new Map(plafonds.map((p) => [p.employeeId, p]));
  const usedOf = new Map<string, number>();
  for (const u of used) {
    const value = Number((u.status === "APPROVED" ? u._sum.approvedAmount : u._sum.amount) ?? 0);
    usedOf.set(u.employeeId, (usedOf.get(u.employeeId) ?? 0) + value);
  }
  return employees.map((e) => {
    const p = plafondOf.get(e.id);
    return {
      employeeId: e.id,
      employeeName: e.fullName,
      employeePosition: e.position,
      annual: p ? Number(p.annualAmount) : null,
      used: usedOf.get(e.id) ?? 0,
    };
  });
}

export async function listHealthCategories(db: PrismaClient) {
  const categories = await db.healthCategory.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  return categories.map((c) => ({ value: c.id, label: c.name }));
}
