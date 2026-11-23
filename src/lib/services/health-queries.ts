// Query halaman Kesehatan. Nominal dikonversi ke number — aman dikirim ke client.
import type { Role } from "@/generated/prisma/enums";
import type { PrismaClient, RequestStatus } from "@/generated/prisma/client";
import { fromIsoDate, toJakartaIsoDate } from "@/lib/format";
import { remainingPlafond } from "@/lib/health";
import { EXPORTABLE_STATUSES, exportOwnerFilter } from "@/lib/export-ids";
import { rejectionsOf } from "./approval";
import { getApprovalTimeline } from "./approval-queries";

const yearRange = (year: number) => ({ gte: fromIsoDate(`${year}-01-01`), lte: fromIsoDate(`${year}-12-31`) });

const claimItems = { orderBy: { id: "asc" as const }, include: { category: { select: { name: true } } } };

/** Nama kategori sebuah klaim: gabungan kategori tiap baris tanpa duplikat (2026-11-06). Draft belum lengkap → keterangan. */
function categoryLabel(claim: { category: { name: string } | null; items: { category: { name: string } }[]; draftForm?: unknown }) {
  if (claim.draftForm != null) return "Draft belum lengkap";
  return claim.items.length ? [...new Set(claim.items.map((item) => item.category.name))].join(", ") : (claim.category?.name ?? "—");
}

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
  employeeId: string;
  /** null = draft (nomor HC terbit saat diajukan, 2026-11-23). */
  number: string | null;
  employeeName: string;
  employeePosition: string;
  categoryName: string;
  /** null = draft belum lengkap. */
  claimDate: string | null;
  createdAt: string;
  /** Draft belum lengkap (2026-11-23): belum bisa diajukan. */
  incomplete: boolean;
  amount: number;
  /** Nominal disetujui (null selama belum disetujui). */
  approvedAmount: number | null;
  note: string | null;
  status: RequestStatus;
  currentLevel: number | null;
  payouts: { month: string; amount: number; paid: boolean }[];
  /** Baris klaim (2026-11-06). */
  items: { categoryId: string; categoryName: string; date: string; amount: number; note: string | null }[];
  /** Milik user yang login (boleh direvisi bila ditolak). */
  own: boolean;
  rejection: { reason: string; by: string } | null;
};

/** Staf: klaim sendiri; Admin: semua yang sudah diajukan + draft miliknya sendiri (draft orang lain tidak tampil, seperti reimburse). */
export async function listHealthClaims(db: PrismaClient, viewer: { role: Role; employeeId: string | null }) {
  const ownId = viewer.employeeId ?? "__none__";
  const claims = await db.healthClaim.findMany({
    where: {
      deletedAt: null,
      ...(viewer.role === "ADMIN" ? { OR: [{ status: { not: "DRAFT" as const } }, { employeeId: ownId }] } : { employeeId: ownId }),
    },
    orderBy: { createdAt: "desc" },
    include: {
      employee: { select: { fullName: true, position: true } },
      category: { select: { name: true } },
      items: claimItems,
      payouts: { orderBy: { periodMonth: "asc" } },
    },
  });
  const approvals = await db.approvalRequest.findMany({
    where: { module: "HEALTH", entityId: { in: claims.map((c) => c.id) } },
    select: { entityId: true, currentLevel: true },
  });
  const levelOf = new Map(approvals.map((a) => [a.entityId, a.currentLevel]));
  const rejections = await rejectionsOf(db, "HEALTH", claims.filter((c) => c.status === "REJECTED").map((c) => c.id));
  return claims.map<HealthClaimRow>((claim) => ({
    id: claim.id,
    employeeId: claim.employeeId,
    number: claim.status === "DRAFT" ? null : claim.number,
    employeeName: claim.employee.fullName,
    employeePosition: claim.employee.position,
    categoryName: categoryLabel(claim),
    claimDate: claim.claimDate ? toJakartaIsoDate(claim.claimDate) : null,
    createdAt: claim.createdAt.toISOString(),
    incomplete: claim.draftForm !== null,
    amount: Number(claim.amount),
    approvedAmount: claim.approvedAmount === null ? null : Number(claim.approvedAmount),
    note: claim.note,
    status: claim.status,
    currentLevel: levelOf.get(claim.id) ?? null,
    payouts: claim.payouts.map((p) => ({ month: toJakartaIsoDate(p.periodMonth).slice(0, 7), amount: Number(p.amount), paid: p.paidAt !== null })),
    items: claim.items.map((item) => ({
      categoryId: item.categoryId,
      categoryName: item.category.name,
      date: toJakartaIsoDate(item.date),
      amount: Number(item.amount),
      note: item.note,
    })),
    own: claim.employeeId === viewer.employeeId,
    rejection: rejections.get(claim.id) ?? null,
  }));
}

/** Detail satu klaim (halaman /kesehatan/[id], 2026-11-20) — tanpa cek hak akses; halaman yang mengecek. Draft terhapus → null. */
export async function getHealthClaimDetail(db: PrismaClient, claimId: string) {
  const claim = await db.healthClaim.findUnique({
    where: { id: claimId, deletedAt: null },
    include: {
      employee: { select: { fullName: true, position: true, division: true } },
      category: { select: { name: true } },
      items: claimItems,
      payouts: { orderBy: { periodMonth: "asc" } },
    },
  });
  if (!claim) return null;
  const { currentLevel, steps, corrections } = await getApprovalTimeline(db, "HEALTH", claim.id);
  return {
    id: claim.id,
    /** null = draft. */
    number: claim.status === "DRAFT" ? null : claim.number,
    status: claim.status,
    currentLevel,
    employeeId: claim.employeeId,
    employeeName: claim.employee.fullName,
    employeePosition: claim.employee.position,
    division: claim.employee.division,
    categoryName: categoryLabel(claim),
    /** null = draft belum lengkap. */
    claimDate: claim.claimDate ? toJakartaIsoDate(claim.claimDate) : null,
    /** Isian draft belum lengkap (dibaca halaman dengan `healthClaimDraftFormSchema`); null = draft lengkap / sudah diajukan. */
    draftForm: claim.draftForm,
    amount: Number(claim.amount),
    approvedAmount: claim.approvedAmount === null ? null : Number(claim.approvedAmount),
    note: claim.note,
    createdAt: claim.createdAt.toISOString(),
    submittedAt: claim.submittedAt?.toISOString() ?? null,
    approvedAt: claim.approvedAt?.toISOString() ?? null,
    items: claim.items.map((item) => ({
      id: item.id,
      categoryId: item.categoryId,
      categoryName: item.category.name,
      date: toJakartaIsoDate(item.date),
      amount: Number(item.amount),
      note: item.note,
    })),
    payouts: claim.payouts.map((p) => ({ month: toJakartaIsoDate(p.periodMonth).slice(0, 7), amount: Number(p.amount), paid: p.paidAt !== null })),
    steps,
    corrections,
  };
}

export type PayoutRow = {
  id: string;
  employeeName: string;
  employeePosition: string;
  /** Untuk tautan nomor klaim → /kesehatan/[id] (2026-11-23). */
  claimId: string;
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
    include: { claim: { include: { employee: { select: { fullName: true, position: true } }, category: { select: { name: true } }, items: claimItems } } },
    orderBy: [{ claim: { employee: { fullName: "asc" } } }, { claim: { number: "asc" } }],
  });
  return payouts.map((p) => ({
    id: p.id,
    employeeName: p.claim.employee.fullName,
    employeePosition: p.claim.employee.position,
    claimId: p.claim.id,
    claimNumber: p.claim.number,
    categoryName: categoryLabel(p.claim),
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

/**
 * Klaim terpilih untuk ekspor (2026-11-09): kelompok per karyawan per tahun klaim (plafon per tahun). Selain Admin hanya
 * miliknya sendiri; draft & yang ditolak tidak ikut. Hasil = `[employeeId, year, claimIds]`, diurutkan nama karyawan lalu tahun.
 */
export async function healthExportGroups(db: PrismaClient, viewer: { role: string; employeeId: string | null }, ids: string[]) {
  if (ids.length === 0) return [];
  const claims = await db.healthClaim.findMany({
    where: { id: { in: ids }, status: { in: [...EXPORTABLE_STATUSES] }, ...exportOwnerFilter(viewer) },
    orderBy: [{ employee: { fullName: "asc" } }, { claimDate: "asc" }],
    select: { id: true, employeeId: true, claimDate: true },
  });
  const groups = new Map<string, { employeeId: string; year: number; claimIds: Set<string> }>();
  for (const claim of claims) {
    // Klaim yang diajukan selalu punya tanggal (hanya draft belum lengkap yang kosong, dan draft tidak ikut ekspor).
    const year = Number(toJakartaIsoDate(claim.claimDate!).slice(0, 4));
    const key = `${claim.employeeId}|${year}`;
    const group = groups.get(key) ?? { employeeId: claim.employeeId, year, claimIds: new Set<string>() };
    group.claimIds.add(claim.id);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** Bulan rekap: "YYYY-MM" (Januari–Desember). */
export const HEALTH_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Rekap bulanan per karyawan (2026-11-19): semua klaim menunggu / disetujui yang TANGGAL KLAIM-nya di bulan itu, untuk satu
 * karyawan atau semua karyawan. Bentuk hasil sama dengan `healthExportGroups` (dicetak halaman yang sama). Selain Admin
 * selalu hanya miliknya sendiri, apa pun karyawan yang diminta.
 */
export async function healthMonthlyGroups(
  db: PrismaClient,
  viewer: { role: string; employeeId: string | null },
  input: { month: string; employeeId: string | null },
) {
  if (!HEALTH_MONTH.test(input.month)) return [];
  const [year, month] = input.month.split("-").map(Number);
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  const claims = await db.healthClaim.findMany({
    where: {
      claimDate: { gte: fromIsoDate(`${input.month}-01`), lt: fromIsoDate(`${next}-01`) },
      status: { in: [...EXPORTABLE_STATUSES] },
      ...(input.employeeId ? { employeeId: input.employeeId } : {}),
      // Dipasang terakhir: untuk selain Admin menimpa employeeId yang diminta dengan miliknya sendiri.
      ...exportOwnerFilter(viewer),
    },
    orderBy: [{ employee: { fullName: "asc" } }, { claimDate: "asc" }, { number: "asc" }],
    select: { id: true, employeeId: true },
  });
  const groups = new Map<string, { employeeId: string; year: number; claimIds: Set<string> }>();
  for (const claim of claims) {
    const group = groups.get(claim.employeeId) ?? { employeeId: claim.employeeId, year, claimIds: new Set<string>() };
    group.claimIds.add(claim.id);
    groups.set(claim.employeeId, group);
  }
  return [...groups.values()];
}

export async function listHealthCategories(db: PrismaClient) {
  const categories = await db.healthCategory.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return categories.map((c) => ({ value: c.id, label: c.name }));
}

export type HealthPrintRow = {
  id: string;
  number: string;
  claimDate: string;
  category: string;
  note: string | null;
  amount: number;
  approvedAmount: number | null;
  status: RequestStatus;
  /** Bulan pembayaran (YYYY-MM) & sudah dibayar? */
  payout: { month: string; paid: boolean } | null;
};

/**
 * Rekap klaim kesehatan per karyawan per tahun untuk dicetak / disimpan PDF (2026-10-16): plafon tahunan,
 * terpakai, menunggu, sisa, dan daftar klaim (kecuali draft). null = karyawan tidak ditemukan.
 */
export async function getHealthPrintData(db: PrismaClient, employeeId: string, year: number) {
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, fullName: true, employeeNo: true, position: true, division: true },
  });
  if (!employee) return null;
  const [plafond, claims] = await Promise.all([
    db.healthPlafond.findUnique({ where: { employeeId_year: { employeeId, year } } }),
    db.healthClaim.findMany({
      where: { employeeId, claimDate: yearRange(year), status: { not: "DRAFT" } },
      orderBy: [{ claimDate: "asc" }, { number: "asc" }],
      include: { category: { select: { name: true } }, items: claimItems, payouts: { orderBy: { periodMonth: "asc" }, take: 1 } },
    }),
  ]);
  const rows: HealthPrintRow[] = claims.map((c) => ({
    id: c.id,
    number: c.number,
    // Draft tidak ikut (status bukan DRAFT), jadi tanggal klaim selalu terisi.
    claimDate: toJakartaIsoDate(c.claimDate!),
    category: categoryLabel(c),
    note: [c.note, ...c.items.map((item) => item.note)].filter(Boolean).join("; ") || null,
    amount: Number(c.amount),
    approvedAmount: c.approvedAmount === null ? null : Number(c.approvedAmount),
    status: c.status,
    payout: c.payouts[0] ? { month: toJakartaIsoDate(c.payouts[0].periodMonth).slice(0, 7), paid: c.payouts[0].paidAt !== null } : null,
  }));
  // Sama dengan ringkasan kesehatan: disetujui memakai nominal disetujui, menunggu memakai nominal diajukan.
  const approved = rows.filter((r) => r.status === "APPROVED").reduce((n, r) => n + (r.approvedAmount ?? r.amount), 0);
  const pending = rows.filter((r) => r.status === "PENDING").reduce((n, r) => n + r.amount, 0);
  const annual = plafond ? Number(plafond.annualAmount) : null;
  return {
    employee,
    year,
    rows,
    summary: { annual, approved, pending, remaining: annual === null ? null : remainingPlafond(annual, approved + pending) },
  };
}
