"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { enqueueApprovalNotifications } from "@/lib/mail/approval-emails";
import { requestProfileChange } from "@/lib/services/profile-change";
import { employeeSelfSchema } from "@/lib/validators/employee";

/**
 * Karyawan mengubah data dirinya sendiri (EMP-06). employeeId SELALU dari session, bukan
 * dari request; schema staf membuang divisi, role, email, dan tanggal masuk. 2026-10-12: perubahan
 * tidak langsung tersimpan — jadi permintaan perubahan yang disetujui Ci Ika.
 */
export async function updateProfileAction(values: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.employeeId) return { ok: false, error: "Akun Anda belum terhubung ke data karyawan. Hubungi Admin." };
  try {
    const result = await requestProfileChange(prisma, user, { kind: "SELF_DATA", employeeId: user.employeeId, payload: employeeSelfSchema.parse(values) });
    await enqueueApprovalNotifications(prisma, result.notifications);
    revalidatePath("/profil", "layout");
    revalidatePath("/approval");
    revalidatePath("/karyawan", "layout");
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}
