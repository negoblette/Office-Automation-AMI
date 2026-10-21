"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { enqueueSecurityNotice } from "@/lib/mail/security-emails";
import { requestMeta } from "@/lib/request-meta";
import { confirmMfaSetup, regenerateBackupCodes } from "@/lib/services/mfa";

const codeSchema = z.string().trim().regex(/^\d{6}$/, { error: "Masukkan 6 digit kode dari aplikasi authenticator" });

/** Konfirmasi pendaftaran authenticator → MFA aktif. Kode cadangan dikembalikan sekali untuk ditampilkan. */
export async function confirmMfaSetupAction(code: unknown): Promise<ActionResult<string[]>> {
  const user = await requireUser({ allowMfaSetup: true });
  const meta = requestMeta(await headers());
  try {
    const codes = await confirmMfaSetup(prisma, user.id, codeSchema.parse(code), meta);
    await enqueueSecurityNotice(prisma, user.id, { kind: "MFA_ENABLED" }, meta);
    return { ok: true, data: codes };
  } catch (error) {
    return toActionError(error);
  }
}

/** Buat ulang kode cadangan (kode lama tidak berlaku). */
export async function regenerateBackupCodesAction(code: unknown): Promise<ActionResult<string[]>> {
  const user = await requireUser();
  const meta = requestMeta(await headers());
  try {
    const codes = await regenerateBackupCodes(prisma, user.id, codeSchema.parse(code), meta);
    await enqueueSecurityNotice(prisma, user.id, { kind: "BACKUP_CODES_REGENERATED" }, meta);
    return { ok: true, data: codes };
  } catch (error) {
    return toActionError(error);
  }
}
