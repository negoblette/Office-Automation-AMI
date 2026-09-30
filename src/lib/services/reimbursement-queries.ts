// Query halaman Reimburse. Nominal BigInt dikonversi ke number (serializeMoney) — aman ke client.
import type { ApprovalStepView } from "@/components/shared/approval-stepper";
import type { Division, Prisma, PrismaClient, RequestStatus } from "@/generated/prisma/client";
import { serializeMoney, toJakartaIsoDate } from "@/lib/format";

const listInclude = {
  employee: { select: { fullName: true, position: true } },
  items: { select: { activity: true }, orderBy: { id: "asc" as const } },
} satisfies Prisma.ReimbursementInclude;

export type ReimbursementListRow = {
  id: string;
  number: string | null;
  employeeName: string;
  employeePosition: string;
  status: RequestStatus;
  currentLevel: number | null;
  createdAt: string;
  submittedAt: string | null;
  totalCash: number;
  totalCc: number;
  total: number;
  itemCount: number;
  summary: string;
};

/**
 * Daftar reimburse. Staf: hanya milik sendiri. Admin: semua yang sudah diajukan + draft
 * miliknya sendiri (draft orang lain tidak ditampilkan).
 */
export async function listReimbursements(
  db: PrismaClient,
  viewer: { role: "ADMIN" | "STAFF"; employeeId: string | null },
): Promise<ReimbursementListRow[]> {
  const ownId = viewer.employeeId ?? "__none__";
  const rows = await db.reimbursement.findMany({
    where: {
      deletedAt: null,
      ...(viewer.role === "ADMIN" ? { OR: [{ status: { not: "DRAFT" as const } }, { employeeId: ownId }] } : { employeeId: ownId }),
    },
    orderBy: { createdAt: "desc" },
    include: listInclude,
  });
  const levels = await currentLevels(db, rows.map((row) => row.id));
  return rows.map((row) => ({
    id: row.id,
    number: row.status === "DRAFT" ? null : row.number,
    employeeName: row.employee.fullName,
    employeePosition: row.employee.position,
    status: row.status,
    currentLevel: levels.get(row.id) ?? null,
    createdAt: row.createdAt.toISOString(),
    submittedAt: row.submittedAt?.toISOString() ?? null,
    ...serializeMoney({ totalCash: row.totalCash, totalCc: row.totalCc, total: row.total }),
    itemCount: row.items.length,
    summary: row.items[0]?.activity ?? "—",
  }));
}

async function currentLevels(db: PrismaClient, entityIds: string[]) {
  const requests = await db.approvalRequest.findMany({
    where: { module: "REIMBURSE", entityId: { in: entityIds } },
    select: { entityId: true, currentLevel: true },
  });
  return new Map(requests.map((request) => [request.entityId, request.currentLevel]));
}

/** Detail reimburse + baris + alur approval (untuk halaman detail & form edit). */
export async function getReimbursementDetail(db: PrismaClient, reimbursementId: string) {
  const r = await db.reimbursement.findUnique({
    where: { id: reimbursementId, deletedAt: null },
    include: {
      employee: { select: { id: true, fullName: true, position: true } },
      items: {
        orderBy: { id: "asc" },
        include: {
          type: { select: { name: true } },
          customer: { select: { name: true } },
          project: { select: { name: true } },
        },
      },
    },
  });
  if (!r) return null;

  const request = await db.approvalRequest.findUnique({
    where: { module_entityId: { module: "REIMBURSE", entityId: r.id } },
    include: { steps: { orderBy: { level: "asc" } } },
  });
  const userIds = request?.steps.flatMap((step) => [...step.approverIds, ...(step.actedById ? [step.actedById] : [])]) ?? [];
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, employee: { select: { fullName: true } } },
  });
  const nameOf = new Map(users.map((user) => [user.id, user.employee?.fullName ?? user.email]));
  const steps: ApprovalStepView[] =
    request?.steps.map((step) => ({
      level: step.level,
      approvers: step.approverIds.map((id) => nameOf.get(id) ?? "—"),
      status: step.status,
      actedBy: step.actedById ? (nameOf.get(step.actedById) ?? null) : null,
      actedAt: step.actedAt?.toISOString() ?? null,
    })) ?? [];

  return {
    id: r.id,
    number: r.status === "DRAFT" ? null : r.number,
    status: r.status,
    currentLevel: request?.currentLevel ?? null,
    employeeId: r.employee.id,
    employeeName: r.employee.fullName,
    employeePosition: r.employee.position,
    division: r.division,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
    submittedAt: r.submittedAt?.toISOString() ?? null,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    ...serializeMoney({ totalCash: r.totalCash, totalCc: r.totalCc, total: r.total }),
    steps,
    items: r.items.map((item) => ({
      id: item.id,
      date: toJakartaIsoDate(item.date),
      customerName: item.customer?.name ?? null,
      projectId: item.projectId,
      projectName: item.project?.name ?? null,
      activity: item.activity,
      participants: item.participants,
      location: item.location,
      typeId: item.typeId,
      typeName: item.type.name,
      hasReceipt: item.hasReceipt,
      paymentMethod: item.paymentMethod,
      amount: Number(item.amount),
      receiptFileKey: item.receiptFileKey,
      receiptFileName: item.receiptFileName,
    })),
  };
}

export type ReimbursementDetail = NonNullable<Awaited<ReturnType<typeof getReimbursementDetail>>>;

/** Pilihan dropdown form: tipe sesuai divisi pemohon (RMB-04), customer, project aktif. */
export async function getReimbursementFormOptions(db: PrismaClient, division: Division) {
  const [types, customers, projects] = await Promise.all([
    db.reimburseType.findMany({ where: { isActive: true, divisions: { has: division } }, orderBy: { name: "asc" } }),
    db.customer.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { name: true } }),
    db.project.findMany({
      where: { isActive: true },
      orderBy: [{ customer: { name: "asc" } }, { name: "asc" }],
      select: { id: true, name: true, customer: { select: { name: true } } },
    }),
  ]);
  return {
    types: types.map((type) => ({ value: type.id, label: type.name })),
    customers: customers.map((customer) => customer.name),
    projects: projects.map((project) => ({ value: project.id, label: `${project.customer.name} — ${project.name}` })),
  };
}

export type ReimbursementFormOptions = Awaited<ReturnType<typeof getReimbursementFormOptions>>;
