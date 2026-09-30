"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { enqueueApprovalNotifications } from "@/lib/mail/approval-emails";
import { ServiceError } from "@/lib/services/errors";
import { deleteReimbursementDraft, saveReimbursementDraft, submitReimbursement } from "@/lib/services/reimbursement";
import { inspectStoredFile } from "@/lib/storage";
import { reimbursementSchema } from "@/lib/validators/reimbursement";

function revalidateReimburse() {
  revalidatePath("/reimburse", "layout");
  revalidatePath("/approval");
}


/**
 * Simpan draft (baru/ubah) dan — jika `submit` — langsung ajukan. Pemohon selalu user yang
 * login; email approval di-enqueue setelah transaksi commit.
 */
export async function saveReimbursementAction(
  reimbursementId: string | null,
  values: unknown,
  submit: boolean,
): Promise<ActionResult<{ reimbursementId: string; number?: string }>> {
  const user = await requireUser();
  try {
    const input = reimbursementSchema.parse(values);
    for (const [index, item] of input.items.entries()) {
      if (item.receiptFileKey && !(await inspectStoredFile(item.receiptFileKey))) {
        throw new ServiceError(`Baris ${index + 1}: file kwitansi tidak ditemukan, silakan upload ulang`);
      }
    }

    // Kwitansi yang diganti tidak dihapus dari storage (NFR v1.14: data tidak dihapus permanen).
    const saved = await saveReimbursementDraft(prisma, user, z.string().nullable().parse(reimbursementId), input);

    let number: string | undefined;
    if (submit) {
      const submitted = await submitReimbursement(prisma, user, saved.reimbursementId);
      await enqueueApprovalNotifications(prisma, submitted.notifications);
      number = submitted.number;
    }
    revalidateReimburse();
    return { ok: true, data: { reimbursementId: saved.reimbursementId, number } };
  } catch (error) {
    return toActionError(error);
  }
}

/** Ajukan draft yang sudah tersimpan (dari halaman detail). */
export async function submitReimbursementAction(reimbursementId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const submitted = await submitReimbursement(prisma, user, z.string().min(1).parse(reimbursementId));
    await enqueueApprovalNotifications(prisma, submitted.notifications);
    revalidateReimburse();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteReimbursementAction(reimbursementId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await deleteReimbursementDraft(prisma, user, z.string().min(1).parse(reimbursementId));
    revalidateReimburse();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}
