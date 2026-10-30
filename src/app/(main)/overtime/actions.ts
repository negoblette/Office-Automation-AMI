"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireAdmin, requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { cancelOvertime, finishOvertime, saveOvertimeRates, startOvertime } from "@/lib/services/overtime";
import { overtimeFinishSchema, overtimeRateSchema } from "@/lib/validators/overtime";

function revalidateOvertime() {
  revalidatePath("/overtime");
  revalidatePath("/reimburse", "layout");
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

/** Clock out + finalize (customer, project, pekerjaan). */
export async function finishOvertimeAction(overtimeId: string, values: unknown): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await finishOvertime(prisma, user, z.string().min(1).parse(overtimeId), overtimeFinishSchema.parse(values));
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

/** Tarif overtime per jam weekday & weekend/libur (Admin). */
export async function saveOvertimeRateAction(values: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    await saveOvertimeRates(prisma, admin.id, overtimeRateSchema.parse(values));
    revalidatePath("/setting/absensi");
    revalidateOvertime();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}
