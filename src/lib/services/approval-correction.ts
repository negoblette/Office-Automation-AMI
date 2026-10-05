// Koreksi approver sebelum menyetujui (Fase 14, keputusan user 2026-10-02): approver step yang
// sedang PENDING boleh mengoreksi nominal & keterangan per baris. Setiap perubahan dicatat di
// ApprovalCorrection (sebelum → sesudah, oleh siapa, di level berapa) dan terlihat pemohon.
import type { ApprovalModule, Prisma, PrismaClient } from "@/generated/prisma/client";
import { formatDate, formatRupiah } from "@/lib/format";
import { canApprove } from "@/lib/roles";
import { reimbursementTotals } from "@/lib/validators/reimbursement";
import { logAudit } from "./audit";
import { ForbiddenError } from "./approval";
import { ServiceError } from "./errors";

type Tx = Prisma.TransactionClient;

/** Modul yang bisa dikoreksi; cuti tidak (tidak ada nominal). */
export const CORRECTABLE_MODULES = ["REIMBURSE", "EXPENSE", "REVENUE", "HEALTH"] as const satisfies readonly ApprovalModule[];

export type CorrectionTarget = {
  targetId: string;
  label: string;
  /** null = nominal tidak bisa dikoreksi di sini (klaim kesehatan: lewat "Nominal disetujui"). */
  amount: number | null;
  text: string;
  textLabel: string;
};

export type CorrectionChange = { targetId: string; amount?: number | null; text?: string | null };

async function loadTargets(db: Tx | PrismaClient, module: ApprovalModule, entityId: string): Promise<CorrectionTarget[]> {
  switch (module) {
    case "REIMBURSE": {
      const items = await db.reimbursementItem.findMany({ where: { reimbursementId: entityId }, orderBy: { id: "asc" } });
      return items.map((item, index) => ({
        targetId: item.id,
        label: `Baris ${index + 1} · ${formatDate(item.date, "short")}`,
        amount: Number(item.amount),
        text: item.activity,
        textLabel: "Aktivitas",
      }));
    }
    case "EXPENSE": {
      const e = await db.projectExpense.findUnique({ where: { id: entityId } });
      return e ? [{ targetId: e.id, label: `Expense · ${formatDate(e.date, "short")}`, amount: Number(e.amount), text: e.description, textLabel: "Keterangan" }] : [];
    }
    case "REVENUE": {
      const r = await db.projectRevenue.findUnique({ where: { id: entityId } });
      return r ? [{ targetId: r.id, label: `Revenue · ${formatDate(r.date, "short")}`, amount: Number(r.amount), text: r.description, textLabel: "Keterangan" }] : [];
    }
    case "HEALTH": {
      const c = await db.healthClaim.findUnique({ where: { id: entityId } });
      return c ? [{ targetId: c.id, label: `Klaim · ${formatDate(c.claimDate, "short")}`, amount: null, text: c.note ?? "", textLabel: "Keterangan" }] : [];
    }
    default:
      return [];
  }
}

/** Pastikan actor adalah approver step PENDING pengajuan ini. */
async function assertCurrentApprover(db: Tx | PrismaClient, requestId: string, actorId: string) {
  const request = await db.approvalRequest.findUnique({ where: { id: requestId }, include: { steps: true } });
  if (!request) throw new ServiceError("Pengajuan tidak ditemukan");
  if (request.status !== "PENDING") throw new ServiceError("Pengajuan ini sudah diproses");
  if (!(CORRECTABLE_MODULES as readonly ApprovalModule[]).includes(request.module)) throw new ServiceError("Pengajuan ini tidak bisa dikoreksi");
  const current = request.steps.find((s) => s.status === "PENDING");
  const actor = await db.user.findUnique({ where: { id: actorId }, select: { role: true, isActive: true } });
  if (!current || !actor?.isActive || !canApprove(actor.role) || !current.approverIds.includes(actorId)) throw new ForbiddenError("Anda tidak berhak mengoreksi pengajuan ini");
  return { request, level: current.level };
}

/** Baris yang bisa dikoreksi (untuk dialog Koreksi di halaman Approval). */
export async function getCorrectionTargets(db: PrismaClient, requestId: string, actorId: string) {
  const { request } = await assertCurrentApprover(db, requestId, actorId);
  return loadTargets(db, request.module, request.entityId);
}

export async function correctRequest(db: PrismaClient, actorId: string, requestId: string, changes: CorrectionChange[]) {
  return db.$transaction(async (tx) => {
    const { request, level } = await assertCurrentApprover(tx, requestId, actorId);
    const targets = new Map((await loadTargets(tx, request.module, request.entityId)).map((t) => [t.targetId, t]));
    const records: Prisma.ApprovalCorrectionCreateManyInput[] = [];

    for (const change of changes) {
      const target = targets.get(change.targetId);
      if (!target) throw new ServiceError("Baris yang dikoreksi tidak ditemukan");
      const amountChanged = change.amount != null && target.amount !== null && change.amount !== target.amount;
      const text = change.text?.trim();
      const textChanged = text != null && text !== target.text;
      if (amountChanged && change.amount! <= 0) throw new ServiceError(`${target.label}: nominal harus lebih dari 0`);
      if (textChanged && text!.length < 2) throw new ServiceError(`${target.label}: ${target.textLabel.toLowerCase()} minimal 2 karakter`);
      if (!amountChanged && !textChanged) continue;

      const amount = amountChanged ? BigInt(change.amount!) : undefined;
      switch (request.module) {
        case "REIMBURSE":
          await tx.reimbursementItem.update({ where: { id: target.targetId }, data: { amount, activity: textChanged ? text : undefined } });
          break;
        case "EXPENSE":
          await tx.projectExpense.update({ where: { id: target.targetId }, data: { amount, description: textChanged ? text : undefined } });
          break;
        case "REVENUE":
          await tx.projectRevenue.update({ where: { id: target.targetId }, data: { amount, description: textChanged ? text : undefined } });
          break;
        case "HEALTH":
          await tx.healthClaim.update({ where: { id: target.targetId }, data: { note: textChanged ? text : undefined } });
          break;
      }
      const base = { requestId, level, targetId: target.targetId, label: target.label, editedById: actorId };
      if (amountChanged) records.push({ ...base, field: "AMOUNT", before: formatRupiah(target.amount!), after: formatRupiah(change.amount!) });
      if (textChanged) records.push({ ...base, field: "TEXT", before: target.text, after: text! });
    }
    if (records.length === 0) throw new ServiceError("Tidak ada perubahan");

    // Total reimburse dihitung ulang dari baris (Tech Spec §6.4).
    if (request.module === "REIMBURSE") {
      const items = await tx.reimbursementItem.findMany({ where: { reimbursementId: request.entityId } });
      const { cash, cc, total } = reimbursementTotals(items.map((i) => ({ paymentMethod: i.paymentMethod, amount: Number(i.amount) })));
      await tx.reimbursement.update({ where: { id: request.entityId }, data: { totalCash: BigInt(cash), totalCc: BigInt(cc), total: BigInt(total) } });
    }
    await tx.approvalCorrection.createMany({ data: records });
    await logAudit(tx, {
      actorId,
      action: "UPDATE",
      entity: "ApprovalRequest",
      entityId: requestId,
      after: { correction: records.map((r) => ({ label: r.label, field: r.field, before: r.before, after: r.after })) },
    });
    return records.length;
  });
}

export type CorrectionView = { id: string; label: string; field: string; before: string; after: string; editedBy: string; level: number; createdAt: string };

/** Riwayat koreksi per pengajuan (untuk pemohon & approver). */
export async function listCorrections(db: PrismaClient, requestIds: string[]): Promise<Map<string, CorrectionView[]>> {
  const rows = requestIds.length
    ? await db.approvalCorrection.findMany({
        where: { requestId: { in: requestIds } },
        orderBy: { createdAt: "asc" },
        include: { editedBy: { select: { email: true, employee: { select: { fullName: true } } } } },
      })
    : [];
  const map = new Map<string, CorrectionView[]>();
  for (const r of rows) {
    const list = map.get(r.requestId) ?? [];
    list.push({
      id: r.id,
      label: r.label,
      field: r.field,
      before: r.before,
      after: r.after,
      editedBy: r.editedBy.employee?.fullName ?? r.editedBy.email,
      level: r.level,
      createdAt: r.createdAt.toISOString(),
    });
    map.set(r.requestId, list);
  }
  return map;
}
