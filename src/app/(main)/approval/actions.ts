"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { enqueueApprovalNotifications } from "@/lib/mail/approval-emails";
import { approveRequest } from "@/lib/services/approval";

const approveSchema = z.object({
  requestId: z.string().min(1),
  note: z.string().trim().max(500, { error: "Catatan maksimal 500 karakter" }).optional(),
  /** Klaim kesehatan: nominal disetujui (v1.14); diabaikan modul lain / level non-final. */
  approvedAmount: z.number().int().positive({ error: "Nominal disetujui harus lebih dari 0" }).nullish(),
});

/** Setujui step PENDING. Hak approve dicek engine (approver step, bukan sekadar Admin). */
export async function approveAction(values: unknown): Promise<ActionResult<{ status: "PENDING" | "APPROVED" }>> {
  const admin = await requireAdmin();
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
