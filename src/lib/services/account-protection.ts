// Akun yang dilindungi dari Admin lain (audit keamanan 2026-11-26, temuan F1). Sebelumnya hanya super admin (2026-10-30).
//
// Kenapa: status "pemegang kunci pemulihan" (Setting → Kunci Pemulihan, recovery-key.ts) ditentukan dari EMAIL login yang
// cocok dengan env RECOVERY_KEY_HOLDERS. Tanpa pengaman ini Admin biasa bisa (a) me-reset password + MFA direktur lalu
// login sebagai dia, atau (b) memindahkan email direktur ke akunnya sendiri — lalu membuat kunci pemulihan sendiri dan ikut
// bisa membuka backup & titipan kunci data.
//
// Aturan:
//  1. Super admin    → tidak bisa diubah Admin lain mana pun (aturan lama).
//  2. Pemegang kunci → hanya super admin yang boleh mengubah role, status aktif, password, MFA, resign/rehire, email login.
//  3. Email pemegang kunci → hanya super admin yang boleh memasang / melepasnya dari akun mana pun (termasuk akun sendiri).
// Akun sendiri tidak dicek aturan 1–2 (jalur masing-masing punya aturan sendiri, mis. tidak bisa mengubah role sendiri).
import type { Prisma } from "@/generated/prisma/client";
import { ServiceError } from "./errors";
import { isRecoveryKeyHolder, recoveryKeyHolders } from "./recovery-key";

type Db = Pick<Prisma.TransactionClient, "user">;

/** Data akun target yang dibutuhkan pengecekan (cukup hasil `select: { id, email, isSuperAdmin }`). */
export type ProtectedAccountRef = { id: string; email: string; isSuperAdmin: boolean };

type Options = {
  /** Nama field form untuk menempelkan pesan error (mis. "email" / "role" di form karyawan). */
  field?: string;
  /** Daftar email pemegang kunci; default env RECOVERY_KEY_HOLDERS (hanya test yang mengisinya). */
  holders?: string[];
};

/** Pelaku adalah super admin yang aktif — dibaca dari database, bukan dari sesi/token. */
async function isActingSuperAdmin(db: Db, actorId: string): Promise<boolean> {
  const actor = await db.user.findUnique({ where: { id: actorId }, select: { role: true, isActive: true, isSuperAdmin: true } });
  return Boolean(actor?.isActive && actor.role === "ADMIN" && actor.isSuperAdmin);
}


/** Aturan 1 & 2: tolak bila `actorId` tidak boleh mengubah akun `target`. */
export async function assertCanManageAccount(
  db: Db,
  target: ProtectedAccountRef,
  actorId: string,
  { field, holders = recoveryKeyHolders() }: Options = {},
): Promise<void> {
  if (target.id === actorId) return;
  if (target.isSuperAdmin) throw new ServiceError("Akun super admin tidak bisa diubah oleh Admin lain", field);
  if (isRecoveryKeyHolder(target.email, holders) && !(await isActingSuperAdmin(db, actorId))) {
    throw new ServiceError("Akun pemegang kunci pemulihan hanya bisa diubah oleh super admin", field);
  }
}

/**
 * Aturan 3: email login lama (`from`; null = akun baru) atau email baru (`to`) adalah email pemegang kunci → hanya super
 * admin. Memasang email itu = memberi hak membuka backup; melepasnya = mencabut hak pemegang kunci yang sah.
 */
export async function assertCanSetLoginEmail(
  db: Db,
  change: { from: string | null; to: string },
  actorId: string,
  { holders = recoveryKeyHolders() }: Options = {},
): Promise<void> {
  const from = change.from?.trim().toLowerCase() ?? null;
  const to = change.to.trim().toLowerCase();
  if (from === to) return;
  const touchesHolder = (from !== null && isRecoveryKeyHolder(from, holders)) || isRecoveryKeyHolder(to, holders);
  if (touchesHolder && !(await isActingSuperAdmin(db, actorId))) {
    throw new ServiceError("Email pemegang kunci pemulihan hanya bisa dipasang atau diubah oleh super admin", "email");
  }
}
