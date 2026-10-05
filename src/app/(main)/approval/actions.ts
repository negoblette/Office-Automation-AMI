"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireApprover } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { enqueueApprovalNotifications } from "@/lib/mail/approval-emails";
import { approveRequest } from "@/lib/services/approval";
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
    amount: z.number().int().nullish(),
    text: z.string().max(500, { error: "Keterangan maksimal 500 karakter" }).nullish(),
  }),
);

/** Simpan koreksi nominal & keterangan (dicatat di ApprovalCorrection + audit). */
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
