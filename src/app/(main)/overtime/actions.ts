"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { enqueueApprovalNotifications } from "@/lib/mail/approval-emails";
import { cancelOvertime, finishOvertime, startOvertime } from "@/lib/services/overtime";
import { overtimeFinishSchema } from "@/lib/validators/overtime";

function revalidateOvertime() {
  revalidatePath("/overtime");
  revalidatePath("/reimburse", "layout");
  revalidatePath("/approval");
}

/** Mulai overtime (clock in): employeeId dari session, jam dari server. */
export async function startOvertimeAction(): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await startOvertime(prisma, user);
    revalidateOvertime();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

/** Clock out + finalize (customer, project, pekerjaan) → diajukan ke approver; juga revisi sesi yang ditolak. */
export async function finishOvertimeAction(overtimeId: string, values: unknown): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const result = await finishOvertime(prisma, user, z.string().min(1).parse(overtimeId), overtimeFinishSchema.parse(values));
    // Email approval di-enqueue SETELAH transaksi commit.
    await enqueueApprovalNotifications(prisma, result.notifications);
    revalidateOvertime();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

/** Batalkan sesi yang masih berjalan (salah tekan). */
export async function cancelOvertimeAction(overtimeId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await cancelOvertime(prisma, user, z.string().min(1).parse(overtimeId));
    revalidateOvertime();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}
