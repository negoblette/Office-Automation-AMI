"use server";

import { headers } from "next/headers";
import { type ActionResult, toActionError } from "@/lib/actions";
import { signOut } from "@/lib/auth";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { requestMeta } from "@/lib/request-meta";
import { changeOwnPassword } from "@/lib/services/password";
import { changePasswordSchema } from "@/lib/validators/auth";

/** Ganti password sendiri → semua sesi berakhir → login ulang dengan password baru. */
export async function changePasswordAction(values: unknown): Promise<ActionResult> {
  const user = await requireUser({ allowPasswordChange: true });
  try {
    const input = changePasswordSchema.parse(values);
    await changeOwnPassword(prisma, user.id, input, requestMeta(await headers()));
  } catch (error) {
    return toActionError(error);
  }
  // Di luar try: signOut melempar redirect.
  await signOut({ redirectTo: "/login?pesan=password-diganti" });
  return { ok: true, data: undefined };
}
