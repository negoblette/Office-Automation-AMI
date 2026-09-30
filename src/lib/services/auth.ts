import argon2 from "argon2";
import type { Role } from "@/generated/prisma/client";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  employeeId: string | null;
};

type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  isActive: boolean;
  employeeId: string | null;
  employee: { fullName: string } | null;
};

export type AuthRepository = {
  findUserByEmail(email: string): Promise<UserRecord | null>;
};

export type VerifyCredentialsResult =
  | { ok: true; user: AuthUser }
  | { ok: false; reason: "INVALID_CREDENTIALS" | "INACTIVE" };

/**
 * Cek email + password. Status nonaktif baru diungkap setelah password benar,
 * supaya status akun tidak bisa ditebak tanpa mengetahui password-nya.
 */
export async function verifyCredentials(
  repo: AuthRepository,
  email: string,
  password: string,
): Promise<VerifyCredentialsResult> {
  const user = await repo.findUserByEmail(email.trim().toLowerCase());
  if (!user) return { ok: false, reason: "INVALID_CREDENTIALS" };

  const passwordMatches = await argon2.verify(user.passwordHash, password);
  if (!passwordMatches) return { ok: false, reason: "INVALID_CREDENTIALS" };

  if (!user.isActive) return { ok: false, reason: "INACTIVE" };

  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.employee?.fullName ?? user.email,
      role: user.role,
      employeeId: user.employeeId,
    },
  };
}
