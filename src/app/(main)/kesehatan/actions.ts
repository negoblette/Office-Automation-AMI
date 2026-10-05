"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireAdmin, requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { enqueueApprovalNotifications } from "@/lib/mail/approval-emails";
import { setHealthPlafond, setPayoutPaid, submitHealthClaim } from "@/lib/services/health";
import { healthClaimSchema, healthPlafondSchema } from "@/lib/validators/health";

function revalidateHealth() {
  revalidatePath("/kesehatan", "layout");
  revalidatePath("/setting/kesehatan");
  revalidatePath("/approval");
}

/** Ajukan klaim kesehatan (HC-03..08). Email approval di-enqueue setelah commit. */
export async function submitHealthClaimAction(values: unknown): Promise<ActionResult<{ number: string }>> {
  const user = await requireUser();
  try {
    const input = healthClaimSchema.parse(values);
    const result = await submitHealthClaim(prisma, user, input);
    await enqueueApprovalNotifications(prisma, result.notifications);
    revalidateHealth();
    return { ok: true, data: { number: result.number } };
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
