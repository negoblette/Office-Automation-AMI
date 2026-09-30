"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { signIn } from "@/lib/auth";
import { loginSchema } from "@/lib/validators/auth";

export type LoginResult = { error?: string };

/** Hanya path internal (`/…`, bukan `//…`) yang boleh dipakai sebagai tujuan setelah login. */
function safeRedirectPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/dashboard";
  }
  return value;
}

export async function loginAction(input: unknown, callbackUrl?: string): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Data login tidak valid" };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: safeRedirectPath(callbackUrl),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.type === "CredentialsSignin") {
        const code = error instanceof CredentialsSignin ? error.code : undefined;
        if (code === "inactive") return { error: "Akun Anda nonaktif. Hubungi Admin." };
        if (code === "rate_limited") return { error: "Terlalu banyak percobaan login gagal. Coba lagi dalam 15 menit." };
        return { error: "Email atau password salah" };
      }
      return { error: "Terjadi kesalahan saat login. Silakan coba lagi." };
    }
    // Redirect setelah login sukses dilempar sebagai error — teruskan.
    throw error;
  }

  return {};
}
