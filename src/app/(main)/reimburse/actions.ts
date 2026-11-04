"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { enqueueApprovalNotifications } from "@/lib/mail/approval-emails";
import { ServiceError } from "@/lib/services/errors";
import { deleteReimbursementDraft, saveIncompleteReimbursementDraft, saveReimbursementDraft, submitReimbursement } from "@/lib/services/reimbursement";
import { reimbursementDraftFormSchema, reimbursementFormSchema, reimbursementSchema } from "@/lib/validators/reimbursement";

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

/**
 * Tombol Simpan Draft (2026-11-04): isian lengkap → draft biasa; belum lengkap → isian disimpan apa adanya supaya bisa
 * dilanjutkan nanti. `values` = isian mentah form (bukan hasil validasi).
 */
export async function saveReimbursementDraftAction(
  reimbursementId: string | null,
  values: unknown,
): Promise<ActionResult<{ reimbursementId: string; complete: boolean }>> {
  const user = await requireUser();
  try {
    const id = z.string().nullable().parse(reimbursementId);
    const parsed = reimbursementFormSchema.safeParse(values);
    if (parsed.success) {
      try {
        const saved = await saveReimbursementDraft(prisma, user, id, parsed.data);
        revalidateReimburse();
        return { ok: true, data: { reimbursementId: saved.reimbursementId, complete: true } };
      } catch (error) {
        // Aturan bisnis belum terpenuhi (mis. Names – Position kosong) → tetap tersimpan sebagai draft belum lengkap.
        if (!(error instanceof ServiceError)) throw error;
      }
    }
    const saved = await saveIncompleteReimbursementDraft(prisma, user, id, reimbursementDraftFormSchema.parse(values));
    revalidateReimburse();
    return { ok: true, data: { reimbursementId: saved.reimbursementId, complete: false } };
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
