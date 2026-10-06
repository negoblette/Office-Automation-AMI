// Customer, Project, Expense & Revenue — URD PRJ-01..04, Tech Spec §6.5. Dikelola Admin;
// semua karyawan boleh MENAMBAH customer & project baru (Fase 14, `createOnly`), tidak mengubah/menghapus.
// Expense & revenue lewat approval engine (flow sama dengan Reimburse) dengan nomor EXP/REV.
import type { PrismaClient } from "@/generated/prisma/client";
import { fromIsoDate } from "@/lib/format";
import type { ProjectExpenseInput, ProjectInput, ProjectRevenueInput } from "@/lib/validators/project";
import type { Actor } from "./access";
import { type ApprovalNotification, buildApproval } from "./approval";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";
import { nextDocumentNumber } from "./numbering";

// ---------------------------------------------------------------------
// Customer & Project
// ---------------------------------------------------------------------

type SaveMasterOptions = { createOnly?: boolean };

export async function saveCustomer(db: PrismaClient, actorId: string, customerId: string | null, name: string, options: SaveMasterOptions = {}) {
  if (options.createOnly && customerId) throw new ServiceError("Hanya Admin yang bisa mengubah customer");
  return db.$transaction(async (tx) => {
    const duplicate = await tx.customer.findFirst({ where: { name: { equals: name, mode: "insensitive" }, id: customerId ? { not: customerId } : undefined } });
    // Customer baru dengan nama yang pernah dihapus (soft delete) → dipulihkan.
    if (duplicate && !(duplicate.deletedAt && !customerId)) {
      throw new ServiceError(duplicate.deletedAt ? "Nama customer pernah dipakai customer yang sudah dihapus" : "Nama customer sudah terdaftar", "name");
    }
    const before = customerId ? await tx.customer.findUnique({ where: { id: customerId, deletedAt: null } }) : duplicate;
    if (customerId && !before) throw new ServiceError("Customer tidak ditemukan");
    const after = customerId
      ? await tx.customer.update({ where: { id: customerId }, data: { name } })
      : duplicate
        ? await tx.customer.update({ where: { id: duplicate.id }, data: { name, deletedAt: null } })
        : await tx.customer.create({ data: { name } });
    await logAudit(tx, { actorId, action: before ? "UPDATE" : "CREATE", entity: "Customer", entityId: after.id, before, after });
    return after;
  });
}

/** Hapus customer — hanya jika belum punya project maupun baris reimburse. */
export async function deleteCustomer(db: PrismaClient, actorId: string, customerId: string) {
  return db.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({
      where: { id: customerId },
      include: { _count: { select: { projects: true, reimbursementItems: true } } },
    });
    if (!customer || customer.deletedAt) throw new ServiceError("Customer tidak ditemukan");
    if (customer._count.projects || customer._count.reimbursementItems) {
      throw new ServiceError("Customer yang sudah punya project atau reimburse tidak bisa dihapus");
    }
    await tx.customer.update({ where: { id: customerId }, data: { deletedAt: new Date() } });
    await logAudit(tx, { actorId, action: "DELETE", entity: "Customer", entityId: customerId, before: customer });
  });
}

export async function saveProject(db: PrismaClient, actorId: string, projectId: string | null, input: ProjectInput, options: SaveMasterOptions = {}) {
  if (options.createOnly && projectId) throw new ServiceError("Hanya Admin yang bisa mengubah project");
  // Project baru dari karyawan selalu aktif (nonaktifkan = wewenang Admin).
  if (options.createOnly) input = { ...input, isActive: true };
  return db.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({ where: { id: input.customerId, deletedAt: null } });
    if (!customer) throw new ServiceError("Customer tidak ditemukan", "customerId");
    const duplicate = await tx.project.findFirst({
      where: { customerId: input.customerId, name: { equals: input.name, mode: "insensitive" }, id: projectId ? { not: projectId } : undefined },
    });
    if (duplicate) throw new ServiceError("Project dengan nama ini sudah ada untuk customer tersebut", "name");
    const sameCode = await tx.project.findFirst({ where: { code: input.code, id: projectId ? { not: projectId } : undefined } });
    if (sameCode) throw new ServiceError(`ID project ${input.code} sudah dipakai project lain`, "code");

    const before = projectId ? await tx.project.findUnique({ where: { id: projectId } }) : null;
    if (projectId && !before) throw new ServiceError("Project tidak ditemukan");
    const after = projectId ? await tx.project.update({ where: { id: projectId }, data: input }) : await tx.project.create({ data: input });
    await logAudit(tx, { actorId, action: before ? "UPDATE" : "CREATE", entity: "Project", entityId: after.id, before, after });
    return after;
  });
}

// ---------------------------------------------------------------------
// Expense & Revenue (PRJ-02, PRJ-04)
// ---------------------------------------------------------------------

export type SubmitProjectEntryResult = { id: string; number: string; status: "PENDING" | "APPROVED"; notifications: ApprovalNotification[] };

async function activeProject(tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0], projectId: string) {
  const project = await tx.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ServiceError("Project tidak ditemukan");
  if (!project.isActive) throw new ServiceError("Project sudah tidak aktif");
  return project;
}

export async function submitProjectExpense(db: PrismaClient, actor: Actor, projectId: string, input: ProjectExpenseInput): Promise<SubmitProjectEntryResult> {
  if (actor.role !== "ADMIN") throw new ServiceError("Hanya Admin yang bisa menginput expense project");
  return db.$transaction(async (tx) => {
    await activeProject(tx, projectId);
    const number = await nextDocumentNumber(tx, "EXP");
    const expense = await tx.projectExpense.create({
      data: {
        number,
        projectId,
        date: fromIsoDate(input.date),
        description: input.description,
        paymentMethod: input.paymentMethod,
        amount: BigInt(input.amount),
        status: "PENDING",
        createdById: actor.id,
      },
    });
    const approval = await buildApproval(tx, { module: "EXPENSE", entityId: expense.id, entityNumber: number, requesterId: actor.id });
    await logAudit(tx, { actorId: actor.id, action: "CREATE", entity: "ProjectExpense", entityId: expense.id, after: expense });
    return { id: expense.id, number, status: approval.status, notifications: approval.notifications };
  });
}

export async function submitProjectRevenue(db: PrismaClient, actor: Actor, projectId: string, input: ProjectRevenueInput): Promise<SubmitProjectEntryResult> {
  if (actor.role !== "ADMIN") throw new ServiceError("Hanya Admin yang bisa menginput revenue project");
  return db.$transaction(async (tx) => {
    await activeProject(tx, projectId);
    const number = await nextDocumentNumber(tx, "REV");
    const revenue = await tx.projectRevenue.create({
      data: {
        number,
        projectId,
        date: fromIsoDate(input.date),
        description: input.description,
        amount: BigInt(input.amount),
        status: "PENDING",
        createdById: actor.id,
      },
    });
    const approval = await buildApproval(tx, { module: "REVENUE", entityId: revenue.id, entityNumber: number, requesterId: actor.id });
    await logAudit(tx, { actorId: actor.id, action: "CREATE", entity: "ProjectRevenue", entityId: revenue.id, after: revenue });
    return { id: revenue.id, number, status: approval.status, notifications: approval.notifications };
  });
}

/**
 * Total project (Tech Spec §6.5): expense = Σ baris reimburse APPROVED yang memilih project ini
 * + Σ ProjectExpense APPROVED (PRJ-03); revenue = Σ ProjectRevenue APPROVED.
 */
export async function projectTotals(db: Pick<PrismaClient, "reimbursementItem" | "projectExpense" | "projectRevenue">, projectId: string) {
  const [reimburse, expense, revenue, pendingExpense, pendingRevenue, pendingReimburse] = await Promise.all([
    db.reimbursementItem.aggregate({ _sum: { amount: true }, where: { projectId, reimbursement: { status: "APPROVED" } } }),
    db.projectExpense.aggregate({ _sum: { amount: true }, where: { projectId, status: "APPROVED" } }),
    db.projectRevenue.aggregate({ _sum: { amount: true }, where: { projectId, status: "APPROVED" } }),
    db.projectExpense.aggregate({ _sum: { amount: true }, where: { projectId, status: "PENDING" } }),
    db.projectRevenue.aggregate({ _sum: { amount: true }, where: { projectId, status: "PENDING" } }),
    db.reimbursementItem.aggregate({ _sum: { amount: true }, where: { projectId, reimbursement: { status: "PENDING" } } }),
  ]);
  const n = (value: bigint | null) => Number(value ?? 0);
  const reimburseTotal = n(reimburse._sum.amount);
  const directExpense = n(expense._sum.amount);
  const revenueTotal = n(revenue._sum.amount);
  return {
    reimburse: reimburseTotal,
    directExpense,
    expense: reimburseTotal + directExpense,
    revenue: revenueTotal,
    margin: revenueTotal - reimburseTotal - directExpense,
    pendingExpense: n(pendingExpense._sum.amount),
    pendingRevenue: n(pendingRevenue._sum.amount),
    pendingReimburse: n(pendingReimburse._sum.amount),
  };
}
