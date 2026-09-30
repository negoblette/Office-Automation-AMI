// Reimburse — URD RMB-01..09, Tech Spec §6.4.
// Draft (nomor sementara) → Ajukan (nomor RMB + approval dalam satu transaksi) → APPROVED
// (efek final di approval-effects.ts). Hanya pemohon yang boleh mengubah/menghapus DRAFT.
import { randomUUID } from "node:crypto";
import type { Division, Prisma, PrismaClient } from "@/generated/prisma/client";
import { fromIsoDate } from "@/lib/format";
import { type ReimbursementInput, reimbursementTotals } from "@/lib/validators/reimbursement";
import { type Actor, assertFileKeyAvailable } from "./access";
import { type ApprovalNotification, buildApproval } from "./approval";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";
import { nextDocumentNumber } from "./numbering";

type Tx = Prisma.TransactionClient;

export const DRAFT_NUMBER_PREFIX = "DRAFT-";

async function getRequester(tx: Tx, actor: Actor) {
  if (!actor.employeeId) throw new ServiceError("Akun Anda belum terhubung ke data karyawan");
  const employee = await tx.employee.findUnique({ where: { id: actor.employeeId }, select: { id: true, status: true, division: true } });
  if (!employee || employee.status !== "ACTIVE") throw new ServiceError("Hanya karyawan aktif yang bisa mengajukan reimburse");
  return employee;
}

async function getOwnDraft(tx: Tx, actor: Actor, reimbursementId: string) {
  const reimbursement = await tx.reimbursement.findUnique({
    where: { id: reimbursementId, deletedAt: null },
    // Tidak ada kolom urutan: id (cuid) berurutan sesuai waktu insert = urutan baris form.
    include: { items: { orderBy: { id: "asc" } } },
  });
  if (!reimbursement) throw new ServiceError("Reimburse tidak ditemukan");
  if (reimbursement.employeeId !== actor.employeeId) throw new ServiceError("Hanya pemohon yang bisa mengubah reimburse ini");
  if (reimbursement.status !== "DRAFT") throw new ServiceError("Reimburse yang sudah diajukan tidak bisa diubah");
  return reimbursement;
}

/** Nama company → id Customer; nama baru otomatis ditambahkan ke master (keputusan user). */
async function resolveCustomerId(tx: Tx, actorId: string, name: string | null): Promise<string | null> {
  if (!name) return null;
  const existing = await tx.customer.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (existing?.deletedAt) await tx.customer.update({ where: { id: existing.id }, data: { deletedAt: null } });
  if (existing) return existing.id;
  const customer = await tx.customer.create({ data: { name } });
  await logAudit(tx, { actorId, action: "CREATE", entity: "Customer", entityId: customer.id, after: { ...customer, source: "reimburse" } });
  return customer.id;
}

/** Validasi & ubah baris input → data Prisma. `ownKeys` = key kwitansi yang sudah milik draft ini. */
async function buildItems(tx: Tx, actorId: string, division: Division, input: ReimbursementInput, ownKeys: Set<string>) {
  const types = await tx.reimburseType.findMany({ where: { isActive: true, divisions: { has: division } } });
  const allowedTypes = new Set(types.map((type) => type.id));

  const items = [];
  for (const [index, item] of input.items.entries()) {
    const row = `Baris ${index + 1}`;
    // RMB-04: tipe harus sesuai divisi pemohon.
    if (!allowedTypes.has(item.typeId)) throw new ServiceError(`${row}: tipe reimburse tidak tersedia untuk divisi Anda`);

    let customerId = await resolveCustomerId(tx, actorId, item.customerName);
    if (item.projectId) {
      const project = await tx.project.findUnique({ where: { id: item.projectId } });
      if (!project?.isActive) throw new ServiceError(`${row}: project tidak ditemukan atau sudah tidak aktif`);
      customerId = project.customerId; // project menentukan customer-nya
    }
    if (item.receiptFileKey && !ownKeys.has(item.receiptFileKey)) await assertFileKeyAvailable(tx, item.receiptFileKey);

    items.push({
      date: fromIsoDate(item.date),
      customerId,
      projectId: item.projectId,
      activity: item.activity,
      participants: item.participants,
      location: item.location,
      typeId: item.typeId,
      hasReceipt: item.hasReceipt,
      paymentMethod: item.paymentMethod,
      amount: BigInt(item.amount),
      receiptFileKey: item.receiptFileKey,
      receiptFileName: item.receiptFileKey ? (item.receiptFileName ?? "kwitansi") : null,
    });
  }
  return items;
}

/** Total dihitung ulang di server (Tech Spec §6.4) — nilai dari client tidak dipercaya. */
function totalsOf(items: { paymentMethod: "CASH" | "CC"; amount: bigint }[]) {
  const { cash, cc, total } = reimbursementTotals(items.map((item) => ({ paymentMethod: item.paymentMethod, amount: Number(item.amount) })));
  return { totalCash: BigInt(cash), totalCc: BigInt(cc), total: BigInt(total) };
}

export type SaveDraftResult = { reimbursementId: string; removedFileKeys: string[] };

/** Buat draft baru (`reimbursementId` null) atau ubah draft milik sendiri. Baris diganti seluruhnya. */
export async function saveReimbursementDraft(
  db: PrismaClient,
  actor: Actor,
  reimbursementId: string | null,
  input: ReimbursementInput,
): Promise<SaveDraftResult> {
  return db.$transaction(async (tx) => {
    const employee = await getRequester(tx, actor);
    const before = reimbursementId ? await getOwnDraft(tx, actor, reimbursementId) : null;
    const ownKeys = new Set((before?.items ?? []).map((item) => item.receiptFileKey).filter((key): key is string => Boolean(key)));

    const items = await buildItems(tx, actor.id, employee.division, input, ownKeys);
    const data = { note: input.note, division: employee.division, ...totalsOf(items) };

    let id: string;
    if (before) {
      await tx.reimbursementItem.deleteMany({ where: { reimbursementId: before.id } });
      await tx.reimbursement.update({ where: { id: before.id }, data: { ...data, items: { create: items } } });
      id = before.id;
    } else {
      const created = await tx.reimbursement.create({
        data: { ...data, employeeId: employee.id, number: `${DRAFT_NUMBER_PREFIX}${randomUUID()}`, items: { create: items } },
      });
      id = created.id;
    }

    const after = await tx.reimbursement.findUniqueOrThrow({ where: { id }, include: { items: true } });
    await logAudit(tx, { actorId: actor.id, action: before ? "UPDATE" : "CREATE", entity: "Reimbursement", entityId: id, before, after });

    const keptKeys = new Set(items.map((item) => item.receiptFileKey).filter(Boolean));
    return { reimbursementId: id, removedFileKeys: [...ownKeys].filter((key) => !keptKeys.has(key)) };
  });
}

export type SubmitResult = { number: string; status: "PENDING" | "APPROVED"; notifications: ApprovalNotification[] };

/** Ajukan draft: nomor RMB + approval dibuat dalam satu transaksi (RMB-01, RMB-07). */
export async function submitReimbursement(db: PrismaClient, actor: Actor, reimbursementId: string): Promise<SubmitResult> {
  return db.$transaction(async (tx) => {
    const employee = await getRequester(tx, actor);
    const draft = await getOwnDraft(tx, actor, reimbursementId);
    if (draft.items.length === 0) throw new ServiceError("Tambahkan minimal 1 baris sebelum mengajukan");
    const missingReceipt = draft.items.findIndex((item) => item.hasReceipt && !item.receiptFileKey);
    if (missingReceipt >= 0) throw new ServiceError(`Baris ${missingReceipt + 1}: upload file kwitansi atau ubah Kwitansi menjadi "Tidak"`);

    const number = await nextDocumentNumber(tx, "RMB");
    await tx.reimbursement.update({
      where: { id: draft.id },
      data: { number, status: "PENDING", submittedAt: new Date(), division: employee.division },
    });
    const approval = await buildApproval(tx, { module: "REIMBURSE", entityId: draft.id, entityNumber: number, requesterId: actor.id });

    await logAudit(tx, { actorId: actor.id, action: "UPDATE", entity: "Reimbursement", entityId: draft.id, before: { status: "DRAFT" }, after: { status: approval.status, number } });
    return { number, status: approval.status, notifications: approval.notifications };
  });
}

/** Hapus draft milik sendiri (soft delete, NFR v1.14; kwitansi tetap disimpan). */
export async function deleteReimbursementDraft(db: PrismaClient, actor: Actor, reimbursementId: string): Promise<void> {
  return db.$transaction(async (tx) => {
    const draft = await getOwnDraft(tx, actor, reimbursementId);
    await tx.reimbursement.update({ where: { id: draft.id }, data: { deletedAt: new Date() } });
    await logAudit(tx, { actorId: actor.id, action: "DELETE", entity: "Reimbursement", entityId: draft.id, before: draft });
  });
}
