"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireAdmin, requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { enqueueApprovalNotifications } from "@/lib/mail/approval-emails";
import { ServiceError } from "@/lib/services/errors";
import {
  deleteHealthClaimDraft,
  saveHealthClaimDraft,
  saveIncompleteHealthClaimDraft,
  setHealthPlafond,
  setPayoutPaid,
  submitHealthClaim,
  submitHealthClaimDraft,
} from "@/lib/services/health";
import { healthClaimDraftFormSchema, healthClaimSchema, healthPlafondSchema } from "@/lib/validators/health";

function revalidateHealth() {
  revalidatePath("/kesehatan", "layout");
  revalidatePath("/setting/kesehatan");
  revalidatePath("/approval");
}

/**
 * Ajukan klaim kesehatan dari form (HC-03..08): baru, draft (`claimId` draft), atau revisi yang ditolak (`claimId` ditolak).
 * Email approval di-enqueue setelah commit.
 */
export async function submitHealthClaimAction(values: unknown, claimId?: string | null): Promise<ActionResult<{ claimId: string; number: string }>> {
  const user = await requireUser();
  try {
    const input = healthClaimSchema.parse(values);
    const result = await submitHealthClaim(prisma, user, input, z.string().min(1).nullish().parse(claimId) ?? undefined);
    await enqueueApprovalNotifications(prisma, result.notifications);
    revalidateHealth();
    return { ok: true, data: { claimId: result.claimId, number: result.number } };
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Tombol Simpan Draft (2026-11-23, sama dengan reimburse): isian lengkap → draft biasa; belum lengkap → isian disimpan apa
 * adanya supaya bisa dilanjutkan nanti. `values` = isian mentah form (bukan hasil validasi).
 */
export async function saveHealthClaimDraftAction(claimId: string | null, values: unknown): Promise<ActionResult<{ claimId: string; complete: boolean }>> {
  const user = await requireUser();
  try {
    const id = z.string().min(1).nullable().parse(claimId);
    const parsed = healthClaimSchema.safeParse(values);
    if (parsed.success) {
      try {
        const saved = await saveHealthClaimDraft(prisma, user, id, parsed.data);
        revalidateHealth();
        return { ok: true, data: { claimId: saved.claimId, complete: true } };
      } catch (error) {
        // Aturan bisnis belum terpenuhi (mis. kategori sudah nonaktif) → tetap tersimpan sebagai draft belum lengkap.
        if (!(error instanceof ServiceError)) throw error;
      }
    }
    const saved = await saveIncompleteHealthClaimDraft(prisma, user, id, healthClaimDraftFormSchema.parse(values));
    revalidateHealth();
    return { ok: true, data: { claimId: saved.claimId, complete: false } };
  } catch (error) {
    return toActionError(error);
  }
}

/** Ajukan draft yang sudah tersimpan / ajukan ulang klaim yang ditolak (dari halaman detail). */
export async function submitHealthClaimDraftAction(claimId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const result = await submitHealthClaimDraft(prisma, user, z.string().min(1).parse(claimId));
    await enqueueApprovalNotifications(prisma, result.notifications);
    revalidateHealth();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

/** Hapus draft klaim milik sendiri (soft delete). */
export async function deleteHealthClaimDraftAction(claimId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await deleteHealthClaimDraft(prisma, user, z.string().min(1).parse(claimId));
    revalidateHealth();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

/** Atur plafon tahunan satu karyawan (HC-01, Admin). */
export async function setHealthPlafondAction(values: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    await setHealthPlafond(prisma, admin.id, healthPlafondSchema.parse(values));
    revalidateHealth();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

/** Tandai pembayaran sudah/belum dibayar (Finance, Admin). */
export async function setPayoutPaidAction(payoutId: string, paid: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    await setPayoutPaid(prisma, admin.id, z.string().min(1).parse(payoutId), z.boolean().parse(paid));
    revalidateHealth();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}
