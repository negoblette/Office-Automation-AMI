import argon2 from "argon2";
import type { PrismaClient, Role } from "@/generated/prisma/client";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  employeeId: string | null;
  sessionVersion: number;
};

type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  isActive: boolean;
  employeeId: string | null;
  sessionVersion: number;
  employee: { fullName: string } | null;
};

export type AuthRepository = {
  findUserByEmail(email: string): Promise<UserRecord | null>;
};

export type VerifyCredentialsResult =
  | { ok: true; user: AuthUser }
  | { ok: false; reason: "INVALID_CREDENTIALS" | "INACTIVE" };

/**
 * Hash pembanding untuk email yang tidak terdaftar: argon2 tetap dijalankan supaya lama respons
 * sama, sehingga email terdaftar tidak bisa ditebak dari waktunya (OWASP Authentication Cheat
 * Sheet — account enumeration). Dibuat sekali lalu dipakai ulang.
 */
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= argon2.hash("penyama-waktu-login-tanpa-akun"));

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
  if (!user) {
    await argon2.verify(await getDummyHash(), password);
    return { ok: false, reason: "INVALID_CREDENTIALS" };
  }

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
      sessionVersion: user.sessionVersion,
    },
  };
}

/**
 * Logout = semua sesi akun berakhir (audit keamanan 2026-11-26, F5). Token sesi berisi `sessionVersion`; menaikkannya
 * membuat SEMUA token lama akun ini (perangkat mana pun, termasuk cookie yang sempat tersalin) ditolak `getCurrentUser`.
 * Sama dengan efek ganti / reset password.
 */
export async function endAllSessions(db: Pick<PrismaClient, "user">, userId: string): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
}
