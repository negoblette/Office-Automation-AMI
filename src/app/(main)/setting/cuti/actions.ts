"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { saveHolidayNotifyUsers } from "@/lib/services/holiday-sync";
import { saveLeavePolicies } from "@/lib/services/leave";
import { holidayNotifyUsersSchema, leavePolicySettingSchema } from "@/lib/validators/leave";

/** Penerima notifikasi perubahan libur dari sinkronisasi (2026-11-18; HR & Direktur). */
export async function saveHolidayNotifyUsersAction(values: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    await saveHolidayNotifyUsers(prisma, admin.id, holidayNotifyUsersSchema.parse(values));
    revalidatePath("/setting/cuti");
    revalidatePath("/cuti", "layout");
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

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
