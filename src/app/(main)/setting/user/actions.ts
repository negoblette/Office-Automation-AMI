"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { enqueueSecurityAlert, enqueueSecurityNotice } from "@/lib/mail/security-emails";
import { requestMeta } from "@/lib/request-meta";
import { unlockLogin } from "@/lib/services/login-throttle";
import { resetUserMfa } from "@/lib/services/mfa";
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
    const alert = await setUserRole(prisma, admin.id, id.parse(userId), userRoleSchema.parse(values).role, requestMeta(await headers()));
    await enqueueSecurityAlert(prisma, alert);
    revalidateUsers();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function setUserActiveAction(userId: string, isActive: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    await setUserActive(prisma, admin.id, id.parse(userId), z.boolean().parse(isActive), requestMeta(await headers()));
    revalidateUsers();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function resetPasswordAction(userId: string, values: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    const targetId = id.parse(userId);
    const meta = requestMeta(await headers());
    await resetUserPassword(prisma, admin.id, targetId, resetPasswordSchema.parse(values).password, meta);
    await enqueueSecurityNotice(prisma, targetId, { kind: "PASSWORD_RESET", actorName: admin.name }, meta);
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

/** Reset MFA user lain (HP hilang & kode cadangan habis) — hardening Tahap 5. Tercatat di audit + email ke user. */
export async function resetMfaAction(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    const targetId = id.parse(userId);
    const meta = requestMeta(await headers());
    await resetUserMfa(prisma, admin.id, targetId, meta);
    await enqueueSecurityNotice(prisma, targetId, { kind: "MFA_RESET", actorName: admin.name }, meta);
    revalidateUsers();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Buka blokir login (hardening Tahap 6): audit log permanen, jadi catatan gagal tidak dihapus — dicatat LOGIN_UNLOCK
 * dan percobaan gagal sebelumnya tidak dihitung lagi untuk email itu.
 */
export async function unlockLoginAction(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    const user = await prisma.user.findUnique({ where: { id: id.parse(userId) }, select: { email: true } });
    if (!user) return { ok: false, error: "User tidak ditemukan" };
    await unlockLogin(prisma, admin.id, user.email, requestMeta(await headers()));
    revalidateUsers();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}
