"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireApprover } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { enqueueApprovalNotifications } from "@/lib/mail/approval-emails";
import { approveRequest, revokeApproval } from "@/lib/services/approval";
import { type CorrectionTarget, correctRequest, getCorrectionTargets } from "@/lib/services/approval-correction";

const approveSchema = z.object({
  requestId: z.string().min(1),
  note: z.string().trim().max(500, { error: "Catatan maksimal 500 karakter" }).optional(),
  /** Klaim kesehatan: nominal disetujui (v1.14); diabaikan modul lain / level non-final. */
  approvedAmount: z.number().int().positive({ error: "Nominal disetujui harus lebih dari 0" }).nullish(),
});

/** Setujui step PENDING. Hak approve dicek engine (approver step, bukan sekadar Admin). */
export async function approveAction(values: unknown): Promise<ActionResult<{ status: "PENDING" | "APPROVED" }>> {
  const admin = await requireApprover();
  try {
    const { requestId, note, approvedAmount } = approveSchema.parse(values);
    const result = await approveRequest(prisma, { requestId, actorId: admin.id, note: note || null, approvedAmount: approvedAmount ?? null });
    // Email di-enqueue SETELAH transaksi approve commit.
    await enqueueApprovalNotifications(prisma, result.notifications);
    revalidatePath("/", "layout");
    return { ok: true, data: { status: result.status } };
  } catch (error) {
    return toActionError(error);
  }
}

/** Baris yang bisa dikoreksi approver step aktif. */
export async function getCorrectionTargetsAction(requestId: string): Promise<ActionResult<CorrectionTarget[]>> {
  const user = await requireApprover();
  try {
    return { ok: true, data: await getCorrectionTargets(prisma, z.string().min(1).parse(requestId), user.id) };
  } catch (error) {
    return toActionError(error);
  }
}

const correctionSchema = z.array(
  z.object({
    targetId: z.string().min(1),
    values: z.record(z.string(), z.union([z.string().max(500, { error: "Isian maksimal 500 karakter" }), z.number(), z.boolean(), z.null()])),
  }),
);

/** Simpan koreksi approver (dicatat di ApprovalCorrection + audit; validasi per field di service). */
export async function correctRequestAction(requestId: string, changes: unknown): Promise<ActionResult> {
  const user = await requireApprover();
  try {
    await correctRequest(prisma, user.id, z.string().min(1).parse(requestId), correctionSchema.parse(changes));
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

const revokeSchema = z.object({
  requestId: z.string().min(1),
  reason: z.string().trim().min(3, { error: "Alasan minimal 3 karakter" }).max(500, { error: "Alasan maksimal 500 karakter" }),
});

/** Batalkan persetujuan terakhir (approver yang menyetujui / Admin) → step kembali menunggu. */
export async function revokeApprovalAction(values: unknown): Promise<ActionResult> {
  const user = await requireApprover();
  try {
    const { requestId, reason } = revokeSchema.parse(values);
    const result = await revokeApproval(prisma, { requestId, actorId: user.id, reason });
    await enqueueApprovalNotifications(prisma, result.notifications);
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}
