"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { enqueueSecurityAlert } from "@/lib/mail/security-emails";
import { requestMeta } from "@/lib/request-meta";
import { createRecoveryKey, isRecoveryKeyHolder, testRecoveryPassphrase } from "@/lib/services/recovery-key";
import { recoveryKeySchema, recoveryKeyTestSchema } from "@/lib/validators/recovery-key";

/** Hanya pemegang kunci (env RECOVERY_KEY_HOLDERS) — dicek di server, bukan hanya menyembunyikan menu. */
async function requireRecoveryKeyHolder() {
  const user = await requireAdmin();
  if (!isRecoveryKeyHolder(user.email)) redirect("/akses-ditolak");
  return user;
}

/** Buat / ganti kunci pemulihan → semua Admin menerima email alarm keamanan. */
export async function createRecoveryKeyAction(values: unknown): Promise<ActionResult> {
  const user = await requireRecoveryKeyHolder();
  const meta = requestMeta(await headers());
  try {
    const input = recoveryKeySchema.parse(values);
    const alert = await createRecoveryKey(prisma, user.id, { passphrase: input.passphrase, loginPassword: input.loginPassword }, meta);
    await enqueueSecurityAlert(prisma, alert);
  } catch (error) {
    return toActionError(error);
  }
  revalidatePath("/setting/kunci-pemulihan");
  revalidatePath("/dashboard");
  return { ok: true, data: undefined };
}

/** Uji kata sandi pemulihan (pengingat tiap 3 bulan di dashboard). */
export async function testRecoveryKeyAction(values: unknown): Promise<ActionResult> {
  const user = await requireRecoveryKeyHolder();
  const meta = requestMeta(await headers());
  try {
    await testRecoveryPassphrase(prisma, user.id, recoveryKeyTestSchema.parse(values).testPassphrase, meta);
  } catch (error) {
    return toActionError(error);
  }
  revalidatePath("/setting/kunci-pemulihan");
  revalidatePath("/dashboard");
  return { ok: true, data: undefined };
}
