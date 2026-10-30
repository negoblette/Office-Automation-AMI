// MFA / verifikasi dua langkah (hardening Tahap 5; NIST SP 800-63B §5.1.4–5.1.5, OWASP MFA Cheat Sheet).
// Kode 6 digit TOTP (RFC 6238: SHA-1, 30 detik) dari Google / Microsoft Authenticator, wajib untuk semua role
// (`mfaRequired` di lib/roles.ts; Staf ikut wajib sejak 2026-10-30).
// Rahasia disimpan terenkripsi (encryptText). Kode cadangan sekali pakai untuk HP hilang; hanya hash-nya yang disimpan.
import { createHash, randomInt } from "node:crypto";
import { Secret, TOTP } from "otpauth";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { decryptText, encryptText } from "@/lib/crypto/field-encryption";
import type { RequestMeta } from "@/lib/request-meta";
import { mfaRequired } from "@/lib/roles";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";

export const MFA_ISSUER = "Office Automation AMI";
export const MFA_PERIOD_SECONDS = 30;
export const BACKUP_CODE_COUNT = 10;
/** Tanpa huruf/angka yang mirip (0/O, 1/I/L): 32 simbol × 10 = 50 bit acak per kode. */
const BACKUP_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

type Tx = Prisma.TransactionClient;

function totpFor(secretBase32: string, label = "akun") {
  return new TOTP({ issuer: MFA_ISSUER, label, algorithm: "SHA1", digits: 6, period: MFA_PERIOD_SECONDS, secret: Secret.fromBase32(secretBase32) });
}

/**
 * Time-step kode TOTP yang cocok (toleransi ±1 langkah = ±30 detik untuk jam HP yang sedikit meleset), atau null.
 * Dipakai juga test untuk membuat kode yang benar.
 */
export function matchTotpStep(secretBase32: string, code: string, now = Date.now()): number | null {
  const delta = totpFor(secretBase32).validate({ token: code, timestamp: now, window: 1 });
  return delta === null ? null : Math.floor(now / 1000 / MFA_PERIOD_SECONDS) + delta;
}

/** Kode TOTP saat ini (hanya untuk test & alat dev). */
export function currentTotp(secretBase32: string, now = Date.now()): string {
  return totpFor(secretBase32).generate({ timestamp: now });
}

const normalizeBackupCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");
const hashBackupCode = (userId: string, code: string) => createHash("sha256").update(`${userId}:${normalizeBackupCode(code)}`).digest("base64url");

function newBackupCode(): string {
  const chars = Array.from({ length: 10 }, () => BACKUP_ALPHABET[randomInt(BACKUP_ALPHABET.length)]).join("");
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}

/** Ganti semua kode cadangan user dengan 10 kode baru; kode polos dikembalikan SEKALI untuk ditampilkan. */
async function replaceBackupCodes(tx: Tx, userId: string): Promise<string[]> {
  const codes = Array.from({ length: BACKUP_CODE_COUNT }, newBackupCode);
  await tx.mfaBackupCode.deleteMany({ where: { userId } });
  await tx.mfaBackupCode.createMany({ data: codes.map((code) => ({ userId, codeHash: hashBackupCode(userId, code) })) });
  return codes;
}

export type MfaStatus = { enabled: boolean; enabledAt: Date | null; backupRemaining: number; required: boolean };

export async function getMfaStatus(db: PrismaClient, userId: string): Promise<MfaStatus> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true, mfaSecret: true, mfaEnabledAt: true } });
  const backupRemaining = await db.mfaBackupCode.count({ where: { userId, usedAt: null } });
  return { enabled: Boolean(user.mfaSecret), enabledAt: user.mfaEnabledAt, backupRemaining, required: mfaRequired(user.role) };
}

/**
 * Mulai pendaftaran: rahasia baru (atau yang sedang didaftarkan, supaya QR tidak berubah saat halaman di-refresh)
 * disimpan sebagai `mfaPendingSecret`. Dikembalikan URI `otpauth://` untuk QR & rahasia base32 untuk diketik manual.
 */
export async function startMfaSetup(db: PrismaClient, userId: string): Promise<{ secret: string; uri: string }> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, mfaSecret: true, mfaPendingSecret: true } });
  if (user.mfaSecret) throw new ServiceError("MFA sudah aktif untuk akun ini");
  let secret = user.mfaPendingSecret ? decryptText(user.mfaPendingSecret) : null;
  if (!secret) {
    secret = new Secret({ size: 20 }).base32;
    await db.user.update({ where: { id: userId }, data: { mfaPendingSecret: encryptText(secret) } });
  }
  return { secret, uri: totpFor(secret, user.email).toString() };
}

/** Konfirmasi pendaftaran dengan kode dari aplikasi authenticator → MFA aktif + 10 kode cadangan baru. */
export async function confirmMfaSetup(db: PrismaClient, userId: string, code: string, meta?: RequestMeta): Promise<string[]> {
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { mfaSecret: true, mfaPendingSecret: true } });
    if (user.mfaSecret) throw new ServiceError("MFA sudah aktif untuk akun ini");
    if (!user.mfaPendingSecret) throw new ServiceError("Pendaftaran MFA belum dimulai. Muat ulang halaman ini.");
    const secret = decryptText(user.mfaPendingSecret);
    const step = matchTotpStep(secret, code.trim());
    if (step === null) throw new ServiceError("Kode salah atau sudah kedaluwarsa. Pastikan jam di HP sudah benar.", "code");
    await tx.user.update({
      where: { id: userId },
      data: { mfaSecret: user.mfaPendingSecret, mfaPendingSecret: null, mfaEnabledAt: new Date(), mfaLastStep: step },
    });
    const codes = await replaceBackupCodes(tx, userId);
    await logAudit(tx, { actorId: userId, action: "UPDATE", entity: "User", entityId: userId, after: { mfaEnabled: true }, ...meta });
    return codes;
  });
}

/**
 * Cek kode TOTP milik user (bukan kode cadangan). Kode yang sama / lebih lama dari yang terakhir diterima ditolak
 * (cegah kode yang terlihat orang lain dipakai ulang). Update bersyarat mencegah dua login bersamaan memakai kode yang sama.
 */
async function consumeTotp(tx: Tx, userId: string, secretEncrypted: string, code: string): Promise<boolean> {
  const step = matchTotpStep(decryptText(secretEncrypted), code);
  if (step === null) return false;
  const { count } = await tx.user.updateMany({
    where: { id: userId, OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: step } }] },
    data: { mfaLastStep: step },
  });
  return count === 1;
}

export type LoginMfaResult =
  | { status: "NOT_ENABLED" }
  | { status: "REQUIRED" }
  | { status: "INVALID" }
  | { status: "OK"; usedBackupCode: false }
  | { status: "OK"; usedBackupCode: true; backupRemaining: number };

/**
 * Langkah kedua login (dipanggil setelah password benar). `REQUIRED` = MFA aktif tapi kode belum diisi →
 * form login menampilkan kolom kode. Kode 6 digit = TOTP; selain itu dianggap kode cadangan (sekali pakai).
 */
export async function verifyLoginMfa(db: PrismaClient, userId: string, code: string | undefined, meta?: RequestMeta): Promise<LoginMfaResult> {
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { mfaSecret: true } });
    if (!user.mfaSecret) return { status: "NOT_ENABLED" };
    const input = code?.trim() ?? "";
    if (!input) return { status: "REQUIRED" };

    if (/^\d{6}$/.test(input.replace(/\s/g, ""))) {
      return (await consumeTotp(tx, userId, user.mfaSecret, input.replace(/\s/g, ""))) ? { status: "OK", usedBackupCode: false } : { status: "INVALID" };
    }

    const { count } = await tx.mfaBackupCode.updateMany({ where: { userId, codeHash: hashBackupCode(userId, input), usedAt: null }, data: { usedAt: new Date() } });
    if (count !== 1) return { status: "INVALID" };
    await logAudit(tx, { actorId: userId, action: "UPDATE", entity: "User", entityId: userId, after: { mfaBackupCodeUsed: true }, ...meta });
    return { status: "OK", usedBackupCode: true, backupRemaining: await tx.mfaBackupCode.count({ where: { userId, usedAt: null } }) };
  });
}

/** Buat ulang 10 kode cadangan (kode lama tidak berlaku). Wajib kode authenticator saat ini. */
export async function regenerateBackupCodes(db: PrismaClient, userId: string, code: string, meta?: RequestMeta): Promise<string[]> {
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { mfaSecret: true } });
    if (!user.mfaSecret) throw new ServiceError("MFA belum aktif");
    if (!(await consumeTotp(tx, userId, user.mfaSecret, code.replace(/\s/g, "")))) {
      throw new ServiceError("Kode authenticator salah atau sudah dipakai. Tunggu kode berikutnya.", "code");
    }
    const codes = await replaceBackupCodes(tx, userId);
    await logAudit(tx, { actorId: userId, action: "UPDATE", entity: "User", entityId: userId, after: { mfaBackupCodesRegenerated: true }, ...meta });
    return codes;
  });
}

/**
 * Admin me-reset MFA user lain (HP hilang & kode cadangan habis). Semua sesi user berakhir; saat login berikutnya
 * user wajib mendaftarkan authenticator lagi. Tidak bisa untuk akun sendiri — minta Admin lain.
 */
export async function resetUserMfa(db: PrismaClient, actorId: string, userId: string, meta?: RequestMeta): Promise<void> {
  if (actorId === userId) throw new ServiceError("Anda tidak bisa me-reset MFA akun sendiri. Minta Admin lain.");
  await db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { mfaSecret: true, isSuperAdmin: true } });
    if (!user) throw new ServiceError("User tidak ditemukan");
    if (user.isSuperAdmin) throw new ServiceError("Akun super admin tidak bisa diubah oleh Admin lain");
    if (!user.mfaSecret) throw new ServiceError("MFA user ini belum aktif");
    await tx.user.update({
      where: { id: userId },
      data: { mfaSecret: null, mfaPendingSecret: null, mfaEnabledAt: null, mfaLastStep: null, sessionVersion: { increment: 1 } },
    });
    await tx.mfaBackupCode.deleteMany({ where: { userId } });
    await logAudit(tx, { actorId, action: "UPDATE", entity: "User", entityId: userId, before: { mfaEnabled: true }, after: { mfaReset: true }, ...meta });
  });
}
