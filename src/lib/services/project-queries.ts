// Query halaman Project & Setting Master Data. Nominal → number (aman ke client).
import type { Role } from "@/generated/prisma/enums";
import type { PaymentMethod, PrismaClient, ProjectType, RequestStatus } from "@/generated/prisma/client";
import { toJakartaIsoDate } from "@/lib/format";
import { projectTotals } from "./project";

type Viewer = { role: Role; employeeId: string | null };
export type ProjectTotals = Awaited<ReturnType<typeof projectTotals>>;

export type ProjectRow = {
  id: string;
  code: string | null;
  name: string;
  type: ProjectType;
  isActive: boolean;
  customerId: string;
  customerName: string;
  /** Hanya untuk Admin. */
  totals: ProjectTotals | null;
};

/** Admin: semua project + total; Staf: project aktif tanpa angka keuangan. */
export async function listProjects(db: PrismaClient, viewer: Viewer): Promise<ProjectRow[]> {
  const isAdmin = viewer.role === "ADMIN";
  const projects = await db.project.findMany({
    where: isAdmin ? {} : { isActive: true },
    orderBy: [{ isActive: "desc" }, { customer: { name: "asc" } }, { name: "asc" }],
    include: { customer: { select: { name: true } } },
  });
  return Promise.all(
    projects.map(async (p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      type: p.type,
      isActive: p.isActive,
      customerId: p.customerId,
      customerName: p.customer.name,
      totals: isAdmin ? await projectTotals(db, p.id) : null,
    })),
  );
}

export async function listCustomersWithProjects(db: PrismaClient) {
  const customers = await db.customer.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    include: {
      projects: { orderBy: [{ isActive: "desc" }, { name: "asc" }] },
      _count: { select: { reimbursementItems: true } },
    },
  });
  return customers.map((c) => ({
    id: c.id,
    name: c.name,
    reimburseCount: c._count.reimbursementItems,
    projects: c.projects.map((p) => ({ id: p.id, code: p.code, name: p.name, type: p.type, isActive: p.isActive, customerId: c.id })),
  }));
}
export type CustomerWithProjects = Awaited<ReturnType<typeof listCustomersWithProjects>>[number];

export type ProjectEntryRow = {
  id: string;
  number: string;
  date: string;
  description: string;
  paymentMethod: PaymentMethod | null;
  amount: number;
  status: RequestStatus;
  currentLevel: number | null;
};

export type ProjectReimburseRow = {
  id: string;
  reimbursementId: string;
  number: string;
  employeeName: string;
  date: string;
  activity: string;
  amount: number;
  status: RequestStatus;
};

/** Detail project. Staf: info project + baris reimburse miliknya saja (tanpa angka keuangan project). */
export async function getProjectDetail(db: PrismaClient, projectId: string, viewer: Viewer) {
  const project = await db.project.findUnique({ where: { id: projectId }, include: { customer: { select: { name: true } } } });
  if (!project) return null;
  const isAdmin = viewer.role === "ADMIN";

  const reimburseItems = await db.reimbursementItem.findMany({
    where: {
      projectId,
      reimbursement: { status: { not: "DRAFT" }, ...(isAdmin ? {} : { employeeId: viewer.employeeId ?? "__none__" }) },
    },
    orderBy: { date: "desc" },
    include: { reimbursement: { select: { id: true, number: true, status: true, employee: { select: { fullName: true } } } } },
  });
  const reimburse: ProjectReimburseRow[] = reimburseItems.map((item) => ({
    id: item.id,
    reimbursementId: item.reimbursement.id,
    number: item.reimbursement.number,
    employeeName: item.reimbursement.employee.fullName,
    date: toJakartaIsoDate(item.date),
    activity: item.activity,
    amount: Number(item.amount),
    status: item.reimbursement.status,
  }));

  let expenses: ProjectEntryRow[] = [];
  let revenues: ProjectEntryRow[] = [];
  if (isAdmin) {
    const [expenseRows, revenueRows] = await Promise.all([
      db.projectExpense.findMany({ where: { projectId }, orderBy: { date: "desc" } }),
      db.projectRevenue.findMany({ where: { projectId }, orderBy: { date: "desc" } }),
    ]);
    const approvals = await db.approvalRequest.findMany({
      where: { module: { in: ["EXPENSE", "REVENUE"] }, entityId: { in: [...expenseRows, ...revenueRows].map((e) => e.id) } },
      select: { entityId: true, currentLevel: true },
    });
    const levelOf = new Map(approvals.map((a) => [a.entityId, a.currentLevel]));
    const toRow = (e: {
      id: string;
      number: string;
      date: Date;
      description: string;
      amount: bigint;
      status: RequestStatus;
      paymentMethod?: PaymentMethod;
    }): ProjectEntryRow => ({
      id: e.id,
      number: e.number,
      date: toJakartaIsoDate(e.date),
      description: e.description,
      paymentMethod: e.paymentMethod ?? null,
      amount: Number(e.amount),
      status: e.status,
      currentLevel: levelOf.get(e.id) ?? null,
    });
    expenses = expenseRows.map(toRow);
    revenues = revenueRows.map(toRow);
  }

  return {
    id: project.id,
    code: project.code,
    name: project.name,
    type: project.type,
    isActive: project.isActive,
    customerName: project.customer.name,
    totals: isAdmin ? await projectTotals(db, projectId) : null,
    expenses,
    revenues,
    reimburse,
  };
}
export type ProjectDetail = NonNullable<Awaited<ReturnType<typeof getProjectDetail>>>;

export async function listMasterData(db: PrismaClient) {
  const [types, categories] = await Promise.all([
    db.reimburseType.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }], include: { _count: { select: { items: true } } } }),
    db.healthCategory.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }], include: { _count: { select: { claims: true } } } }),
  ]);
  return {
    types: types.map((t) => ({ id: t.id, code: t.code, name: t.name, divisions: t.divisions, isActive: t.isActive, usage: t._count.items })),
    categories: categories.map((c) => ({ id: c.id, name: c.name, isActive: c.isActive, usage: c._count.claims })),
  };
}
export type MasterData = Awaited<ReturnType<typeof listMasterData>>;

/** Saran ID project berikutnya (PRJ-0001, PRJ-0002, …) dari ID berpola PRJ-<angka> terbesar. */
export async function nextProjectCode(db: PrismaClient) {
  const codes = await db.project.findMany({ where: { code: { startsWith: "PRJ-" } }, select: { code: true } });
  const max = codes.reduce((n, { code }) => Math.max(n, Number(/^PRJ-(\d+)$/.exec(code ?? "")?.[1] ?? 0)), 0);
  return `PRJ-${String(max + 1).padStart(4, "0")}`;
}
