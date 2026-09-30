"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { resetUserPassword, setUserActive, setUserRole } from "@/lib/services/user-admin";
import { resetPasswordSchema, userRoleSchema } from "@/lib/validators/setting";

const id = z.string().min(1);

function revalidateUsers() {
  revalidatePath("/setting/user");
  revalidatePath("/karyawan", "layout");
}

export async function setUserRoleAction(userId: string, values: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    await setUserRole(prisma, admin.id, id.parse(userId), userRoleSchema.parse(values).role);
    revalidateUsers();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function setUserActiveAction(userId: string, isActive: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    await setUserActive(prisma, admin.id, id.parse(userId), z.boolean().parse(isActive));
    revalidateUsers();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function resetPasswordAction(userId: string, values: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    await resetUserPassword(prisma, admin.id, id.parse(userId), resetPasswordSchema.parse(values).password);
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}
