"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { updateSelf } from "@/lib/services/employee";
import { employeeSelfSchema } from "@/lib/validators/employee";

/**
 * Karyawan mengubah data dirinya sendiri (EMP-06). employeeId SELALU dari session, bukan
 * dari request; schema staf membuang divisi, role, email, dan tanggal masuk.
 */
export async function updateProfileAction(values: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.employeeId) return { ok: false, error: "Akun Anda belum terhubung ke data karyawan. Hubungi Admin." };
  try {
    await updateSelf(prisma, user.id, user.employeeId, employeeSelfSchema.parse(values));
    revalidatePath("/profil", "layout");
    revalidatePath("/karyawan", "layout");
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}
