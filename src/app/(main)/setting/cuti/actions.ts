"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { saveLeavePolicies } from "@/lib/services/leave";
import { leavePolicySettingSchema } from "@/lib/validators/leave";

/** Simpan jatah cuti per masa kerja & batas carry over (SET-03). */
export async function saveLeaveSettingsAction(values: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    await saveLeavePolicies(prisma, admin.id, leavePolicySettingSchema.parse(values));
    revalidatePath("/setting/cuti");
    revalidatePath("/cuti", "layout");
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}
