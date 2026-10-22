// Kunci pemulihan (docs/08-INVENTARIS-DATA.md §4–5) — pengganti penitipan kunci lewat perintah `age` di laptop Direktur.
// Pemegang kunci (env RECOVERY_KEY_HOLDERS: Pak Rudy & Pak Leonard) cukup membuat KATA SANDI PEMULIHAN di
// Setting → Kunci Pemulihan. Sistem lalu:
//  1. membuat kunci age (X25519) khusus pemegang itu, menguncinya dengan kata sandi pemulihan (scrypt, format age), dan
//     menyimpannya sebagai file `kunci-pemulihan-<email>.age` di RECOVERY_DIR;
//  2. mencatat kunci publiknya ("gembok") di tabel RecoveryKey;
//  3. menulis ulang `penerima.txt` (gembok semua pemegang → dipakai scripts/backup.sh) dan `kunci-data.age` (titipan
//     DATA_ENCRYPTION_KEYS & DATA_INDEX_KEY, dikunci untuk semua gembok).
// RECOVERY_DIR ikut tersalin ke setiap backup (kunci_YYYYMMDD_HHMM.tar). Server rusak total → scripts/restore.sh meminta
// salah satu pemegang kunci mengetik kata sandi pemulihannya, lalu membuka backup & titipan kunci data.
// File kunci sengaja TIDAK disimpan di database: database yang bocor (mis. SQL injection) tidak memberi bahan untuk menebak
// kata sandi pemulihan. Tanpa "server-only": dipakai juga scripts/recovery-refresh.ts (service migrate).
import { randomUUID } from "node:crypto";
import { access, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Decrypter, Encrypter, armor, generateX25519Identity, identityToRecipient } from "age-encryption";
import argon2 from "argon2";
import type { PrismaClient } from "@/generated/prisma/client";
import { activeKeyId, nikIndexKey } from "@/lib/crypto/keys";
import { passwordProblem } from "@/lib/password-policy";
import type { RequestMeta } from "@/lib/request-meta";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";
import { type SecurityAlert, recoveryKeyChangedAlert } from "./security-monitor";

/** Minimal pemegang kunci yang sudah membuat kunci pemulihan sebelum backup mau berjalan (keputusan 2026-10-20). */
export const RECOVERY_MIN_HOLDERS = 2;
/** Pengingat uji kata sandi pemulihan di dashboard. */
export const RECOVERY_TEST_INTERVAL_DAYS = 90;
/** Batas uji kata sandi yang salah per pemegang. */
export const RECOVERY_TEST_LIMIT = { failures: 5, windowMinutes: 15 } as const;
/** Faktor kerja scrypt bawaan age (2^18, ±1 detik per percobaan) — memperlambat tebak-tebakan kata sandi. */
const AGE_SCRYPT_WORK_FACTOR = 18;

const RECIPIENTS_FILE = "penerima.txt";
const ESCROW_FILE = "kunci-data.age";
const README_FILE = "BACA-SAYA.txt";
const IDENTITY_PREFIX = "kunci-pemulihan-";
/** Kunci advisory PostgreSQL: dua penulisan ulang file kunci tidak berjalan bersamaan. */
const REFRESH_LOCK_ID = 7_310_427;

export type RecoveryOptions = {
  /** Folder file kunci; default env RECOVERY_DIR atau ./storage/recovery. */
  dir?: string;
  /** Email pemegang kunci; default env RECOVERY_KEY_HOLDERS. */
  holders?: string[];
  /** log2 faktor kerja scrypt; hanya test yang menurunkannya supaya cepat. */
  workFactor?: number;
};

/** Daftar email pemegang kunci dari teks "a@x,b@x" (huruf kecil, tanpa duplikat). */
export function parseRecoveryHolders(raw: string | undefined): string[] {
  return [...new Set((raw ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean))];
}

/** Pemegang kunci ditetapkan di konfigurasi server, bukan dari aplikasi — Admin lain tidak bisa mendaftarkan diri. */
export function recoveryKeyHolders(): string[] {
  return parseRecoveryHolders(process.env.RECOVERY_KEY_HOLDERS);
}

export function isRecoveryKeyHolder(email: string, holders: string[] = recoveryKeyHolders()): boolean {
  return holders.includes(email.trim().toLowerCase());
}

export function recoveryDir(): string {
  return path.resolve(process.env.RECOVERY_DIR ?? "./storage/recovery");
}

/** Nama file kunci pemulihan milik `email` (karakter di luar email biasa diganti "_"). */
export function identityFileName(email: string): string {
  return `${IDENTITY_PREFIX}${email.toLowerCase().replace(/[^a-z0-9@._+-]/g, "_")}.age`;
}

/** Isi file kunci pribadi (format identity age; baris "#" = komentar) sebelum dikunci kata sandi pemulihan. */
export function buildIdentityFile(email: string, identity: string, recipient: string, createdAt: Date): string {
  return [`# Kunci pemulihan Office Automation — ${email}`, `# dibuat: ${createdAt.toISOString()}`, `# public key: ${recipient}`, identity, ""].join("\n");
}

export function identityFromFile(text: string): string | null {
  return text.split(/\r?\n/).map((line) => line.trim()).find((line) => line.startsWith("AGE-SECRET-KEY-1")) ?? null;
}

/** Isi penerima.txt: format file penerima `age -R` (baris "#" = komentar). */
export function buildRecipientsFile(entries: { email: string; recipient: string }[]): string {
  const lines = [
    "# Gembok (kunci publik age) para pemegang kunci — backup & titipan kunci data dikunci untuk mereka.",
    "# Dibuat otomatis oleh aplikasi (Setting → Kunci Pemulihan), jangan diedit. Lihat docs/08-INVENTARIS-DATA.md §4.",
  ];
  for (const entry of entries) lines.push(`# ${entry.email}`, entry.recipient);
  return `${lines.join("\n")}\n`;
}

/** Isi titipan kunci data: dua baris siap tempel ke .env.production (scripts/restore.sh melakukannya otomatis). */
export function buildEscrowText(now = new Date()): string {
  // Kunci yang tidak valid langsung ketahuan di sini, bukan saat server harus dipulihkan.
  activeKeyId();
  nikIndexKey();
  return [
    `# Titipan kunci data Office Automation — dibuat ${now.toISOString()}`,
    "# Dua baris di bawah adalah isi .env.production (scripts/restore.sh menyalinnya otomatis).",
    `DATA_ENCRYPTION_KEYS="${process.env.DATA_ENCRYPTION_KEYS}"`,
    `DATA_INDEX_KEY="${process.env.DATA_INDEX_KEY}"`,
    "",
  ].join("\n");
}

const README = `BACA SAYA — folder kunci pemulihan Office Automation

File di folder ini dibuat otomatis oleh aplikasi dan ikut tersalin ke setiap backup (kunci_YYYYMMDD_HHMM.tar):
  kunci-pemulihan-<email>.age  kunci pribadi tiap pemegang kunci, terkunci KATA SANDI PEMULIHAN miliknya
  kunci-data.age               titipan kunci data (DATA_ENCRYPTION_KEYS & DATA_INDEX_KEY), terkunci untuk semua pemegang
  penerima.txt                 gembok (kunci publik) para pemegang kunci — backup dikunci untuk mereka

Tidak ada yang bisa dibuka tanpa kata sandi pemulihan salah satu pemegang kunci (Pak Rudy / Pak Leonard).
Memulihkan server: scripts/restore.sh --db backups/db_YYYYMMDD_HHMM.dump.age --uploads backups/uploads_YYYYMMDD_HHMM.tar.gz.age
Langkah lengkap: docs/07-DEPLOYMENT.md (bagian "Memulihkan dari backup").
`;

async function writeAtomic(file: string, content: string): Promise<void> {
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, content, { mode: 0o644 });
  await rename(temp, file);
}

async function exists(file: string): Promise<boolean> {
  return access(file).then(
    () => true,
    () => false,
  );
}

async function lockWithPassphrase(text: string, passphrase: string, workFactor: number): Promise<string> {
  const encrypter = new Encrypter();
  encrypter.setPassphrase(passphrase);
  encrypter.setScryptWorkFactor(workFactor);
  return armor.encode(await encrypter.encrypt(text));
}

/** Isi file yang dikunci kata sandi, atau null bila kata sandi salah. */
async function unlockWithPassphrase(armored: string, passphrase: string): Promise<string | null> {
  const file = armor.decode(armored); // file rusak → error (bukan "kata sandi salah")
  const decrypter = new Decrypter();
  decrypter.addPassphrase(passphrase);
  try {
    return await decrypter.decrypt(file, "text");
  } catch {
    return null;
  }
}

type ActiveKey = { id: string; email: string; recipient: string; createdAt: Date; verifiedAt: Date | null };

async function activeRecoveryKeys(db: Pick<PrismaClient, "recoveryKey">, holders: string[]): Promise<ActiveKey[]> {
  const rows = await db.recoveryKey.findMany({
    where: { revokedAt: null, user: { email: { in: holders } } },
    orderBy: { createdAt: "asc" },
    select: { id: true, recipient: true, createdAt: true, verifiedAt: true, user: { select: { email: true } } },
  });
  return rows.map(({ user, ...row }) => ({ ...row, email: user.email }));
}

export type RecoveryRefreshResult = { holders: string[]; withKey: string[]; withoutKey: string[]; escrow: boolean };

/**
 * Tulis ulang penerima.txt, titipan kunci data, dan BACA-SAYA.txt dari kunci pemulihan yang aktif; hapus file kunci
 * milik email yang bukan pemegang kunci lagi. Dipanggil setelah kunci dibuat/diganti dan oleh service migrate di setiap
 * deploy (rotasi kunci data / daftar pemegang berubah). Aman dijalankan berulang.
 */
export async function refreshRecoveryFiles(db: PrismaClient, options: RecoveryOptions = {}, now = new Date()): Promise<RecoveryRefreshResult> {
  const dir = options.dir ?? recoveryDir();
  const holders = options.holders ?? recoveryKeyHolders();
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${REFRESH_LOCK_ID})`;
    const keys = await activeRecoveryKeys(tx, holders);
    await mkdir(dir, { recursive: true });
    await writeAtomic(path.join(dir, RECIPIENTS_FILE), buildRecipientsFile(keys));

    const escrowPath = path.join(dir, ESCROW_FILE);
    if (keys.length > 0) {
      const encrypter = new Encrypter();
      for (const key of keys) encrypter.addRecipient(key.recipient);
      await writeAtomic(escrowPath, armor.encode(await encrypter.encrypt(buildEscrowText(now))));
    } else {
      await rm(escrowPath, { force: true });
    }

    const keep = new Set(keys.map((key) => identityFileName(key.email)));
    for (const name of await readdir(dir)) {
      if (name.startsWith(IDENTITY_PREFIX) && name.endsWith(".age") && !keep.has(name)) await rm(path.join(dir, name), { force: true });
    }
    await writeAtomic(path.join(dir, README_FILE), README);

    const withKey = keys.map((key) => key.email);
    return { holders, withKey, withoutKey: holders.filter((email) => !withKey.includes(email)), escrow: keys.length > 0 };
  });
}

export type RecoveryHolderStatus = {
  email: string;
  name: string;
  /** null = belum membuat kunci pemulihan. */
  key: { createdAt: Date; verifiedAt: Date | null; fileMissing: boolean } | null;
};

export type RecoveryOverview = { holders: RecoveryHolderStatus[]; readyCount: number; minHolders: number };

/** Status kunci pemulihan semua pemegang kunci (halaman Setting → Kunci Pemulihan & pengingat dashboard). */
export async function getRecoveryOverview(db: PrismaClient, options: RecoveryOptions = {}): Promise<RecoveryOverview> {
  const dir = options.dir ?? recoveryDir();
  const holders = options.holders ?? recoveryKeyHolders();
  const [keys, users] = await Promise.all([
    activeRecoveryKeys(db, holders),
    db.user.findMany({ where: { email: { in: holders } }, select: { email: true, employee: { select: { fullName: true } } } }),
  ]);
  const statuses = await Promise.all(
    holders.map(async (email): Promise<RecoveryHolderStatus> => {
      const key = keys.find((k) => k.email === email);
      return {
        email,
        name: users.find((u) => u.email === email)?.employee?.fullName ?? email,
        key: key ? { createdAt: key.createdAt, verifiedAt: key.verifiedAt, fileMissing: !(await exists(path.join(dir, identityFileName(email)))) } : null,
      };
    }),
  );
  return { holders: statuses, readyCount: statuses.filter((s) => s.key && !s.key.fileMissing).length, minHolders: RECOVERY_MIN_HOLDERS };
}

/** Pengingat untuk pemegang kunci: belum punya kunci (atau filenya hilang), atau sudah > 90 hari tidak diuji. */
export function recoveryReminder(status: RecoveryHolderStatus | undefined, now = new Date()): "MISSING" | "TEST_DUE" | null {
  if (!status) return null;
  if (!status.key || status.key.fileMissing) return "MISSING";
  const lastChecked = status.key.verifiedAt ?? status.key.createdAt;
  return now.getTime() - lastChecked.getTime() > RECOVERY_TEST_INTERVAL_DAYS * 86_400_000 ? "TEST_DUE" : null;
}

async function holderUser(db: PrismaClient, userId: string, holders: string[]) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, passwordHash: true, isActive: true, employee: { select: { fullName: true } } },
  });
  if (!user?.isActive || !isRecoveryKeyHolder(user.email, holders)) throw new ServiceError("Akun ini bukan pemegang kunci pemulihan");
  return user;
}

/**
 * Buat (atau ganti) kunci pemulihan milik pemegang kunci. Wajib password login yang benar. Kunci lama tidak dipakai lagi
 * untuk backup baru; backup lama tetap bisa dibuka dengan kata sandi lama (file kuncinya ikut tersimpan di backup itu).
 * Mengembalikan alarm untuk semua Admin — panggil enqueueSecurityAlert SETELAH fungsi ini selesai.
 */
export async function createRecoveryKey(
  db: PrismaClient,
  userId: string,
  input: { passphrase: string; loginPassword: string },
  meta?: RequestMeta,
  options: RecoveryOptions = {},
): Promise<SecurityAlert | null> {
  const dir = options.dir ?? recoveryDir();
  const holders = options.holders ?? recoveryKeyHolders();
  const user = await holderUser(db, userId, holders);
  if (!(await argon2.verify(user.passwordHash, input.loginPassword))) throw new ServiceError("Password login salah", "loginPassword");
  if (input.passphrase === input.loginPassword) throw new ServiceError("Kata sandi pemulihan harus berbeda dari password login", "passphrase");
  const problem = passwordProblem(input.passphrase, [user.email.split("@")[0], user.employee?.fullName ?? ""]);
  if (problem) throw new ServiceError(problem.replace(/^Password/, "Kata sandi pemulihan"), "passphrase");
  buildEscrowText(); // kunci data harus valid sebelum apa pun disimpan

  const now = new Date();
  const identity = await generateX25519Identity();
  const recipient = await identityToRecipient(identity);
  const locked = await lockWithPassphrase(buildIdentityFile(user.email, identity, recipient, now), input.passphrase, options.workFactor ?? AGE_SCRYPT_WORK_FACTOR);

  // File baru baru menggantikan file lama setelah database tersimpan, supaya file & gembok di database selalu cocok.
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, identityFileName(user.email));
  const pendingPath = `${filePath}.${randomUUID()}.baru`;
  await writeFile(pendingPath, locked, { mode: 0o644 });
  let alert: SecurityAlert | null;
  try {
    alert = await db.$transaction(async (tx) => {
      // Satu kunci aktif per pemegang: dua simpan bersamaan menunggu giliran.
      await tx.$executeRaw`SELECT 1 FROM "User" WHERE id = ${userId} FOR UPDATE`;
      const previous = await tx.recoveryKey.findMany({ where: { userId, revokedAt: null }, select: { id: true } });
      await tx.recoveryKey.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
      const created = await tx.recoveryKey.create({ data: { userId, recipient, createdAt: now } });
      await logAudit(tx, {
        actorId: userId,
        action: "CREATE",
        entity: "RecoveryKey",
        entityId: created.id,
        after: { recipient, replaced: previous.map((key) => key.id) },
        ...meta,
      });
      return recoveryKeyChangedAlert(tx, { userId, userName: user.employee?.fullName ?? user.email, replaced: previous.length > 0 }, meta);
    });
  } catch (error) {
    await rm(pendingPath, { force: true });
    throw error;
  }
  await rename(pendingPath, filePath);
  await refreshRecoveryFiles(db, { dir, holders }, now);
  return alert;
}

/**
 * Uji kata sandi pemulihan (disarankan tiap 3 bulan): file kunci dibuka dengan kata sandi lalu dicocokkan dengan gembok
 * di database. Salah → dicatat; 5 kali salah dalam 15 menit → ditahan sementara.
 */
export async function testRecoveryPassphrase(
  db: PrismaClient,
  userId: string,
  passphrase: string,
  meta?: RequestMeta,
  options: RecoveryOptions = {},
): Promise<void> {
  const dir = options.dir ?? recoveryDir();
  const user = await holderUser(db, userId, options.holders ?? recoveryKeyHolders());
  const key = await db.recoveryKey.findFirst({ where: { userId, revokedAt: null }, orderBy: { createdAt: "desc" } });
  if (!key) throw new ServiceError("Anda belum membuat kunci pemulihan");

  const since = new Date(Date.now() - RECOVERY_TEST_LIMIT.windowMinutes * 60_000);
  const failures = await db.auditLog.count({ where: { action: "RECOVERY_KEY_TEST_FAILED", userId, createdAt: { gte: since } } });
  if (failures >= RECOVERY_TEST_LIMIT.failures) {
    throw new ServiceError(`Terlalu banyak percobaan yang salah. Coba lagi dalam ${RECOVERY_TEST_LIMIT.windowMinutes} menit.`);
  }

  let armored: string;
  try {
    armored = await readFile(path.join(dir, identityFileName(user.email)), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    throw new ServiceError("File kunci pemulihan Anda tidak ditemukan di server. Buat ulang kunci pemulihan di halaman ini.");
  }
  const text = await unlockWithPassphrase(armored, passphrase);
  const identity = text ? identityFromFile(text) : null;
  if (!identity) {
    await logAudit(db, { actorId: userId, action: "RECOVERY_KEY_TEST_FAILED", entity: "RecoveryKey", entityId: key.id, ...meta });
    throw new ServiceError("Kata sandi pemulihan salah", "passphrase");
  }
  if ((await identityToRecipient(identity)) !== key.recipient) {
    throw new ServiceError("File kunci pemulihan di server tidak cocok dengan data. Buat ulang kunci pemulihan di halaman ini.");
  }
  await db.$transaction(async (tx) => {
    await tx.recoveryKey.update({ where: { id: key.id }, data: { verifiedAt: new Date() } });
    await logAudit(tx, { actorId: userId, action: "RECOVERY_KEY_TESTED", entity: "RecoveryKey", entityId: key.id, ...meta });
  });
}
