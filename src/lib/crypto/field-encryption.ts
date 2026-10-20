// Enkripsi kolom data pribadi (hardening Tahap 4, docs/08-INVENTARIS-DATA.md): AES-256-GCM, IV acak 12 byte.
// Format tersimpan "<idKunci>:<iv>:<ciphertext>:<tag>" (base64url), mis. "v1:9fK2xQ…:Lm3p…:Zr8a…".
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { activeKey, keyById, nikIndexKey } from "./keys";

const ENCRYPTED = /^([a-z0-9]{1,16}):([A-Za-z0-9_-]{16}):([A-Za-z0-9_-]*):([A-Za-z0-9_-]{22})$/;

/** Nilai sudah berupa ciphertext (bukan nilai lama yang masih terbuka)? */
export function isEncryptedValue(value: string): boolean {
  return ENCRYPTED.test(value);
}

/** Id kunci yang dipakai nilai terenkripsi; null = belum dienkripsi. */
export function encryptedKeyId(value: string): string | null {
  return ENCRYPTED.exec(value)?.[1] ?? null;
}

/**
 * Kunci teks dengan kunci aktif. null / undefined / "" dikembalikan apa adanya, supaya kolom kosong tetap kosong
 * (kelengkapan profil & logika "terisi / belum" tidak berubah).
 */
export function encryptText<T extends string | null | undefined>(value: T): T {
  if (!value) return value;
  const { id, key } = activeKey("field");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${id}:${iv.toString("base64url")}:${data.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}` as T;
}

/** Buka teks terenkripsi. Nilai lama yang belum dienkripsi (sebelum Tahap 4) dikembalikan apa adanya. */
export function decryptText<T extends string | null | undefined>(value: T): T {
  if (!value) return value;
  const match = ENCRYPTED.exec(value);
  if (!match) return value;
  const [, id, iv, data, tag] = match;
  const decipher = createDecipheriv("aes-256-gcm", keyById("field", id), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  try {
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8") as T;
  } catch {
    throw new Error(`Data terenkripsi tidak bisa dibuka (kunci "${id}" tidak cocok atau data rusak/diubah).`);
  }
}

/** Sidik jari NIK (HMAC-SHA256) untuk cek "NIK sudah terdaftar" & pencarian tanpa menyimpan NIK terbuka. */
export function nikIndex(nik: string): string {
  return createHmac("sha256", nikIndexKey()).update(nik, "utf8").digest("base64url");
}
