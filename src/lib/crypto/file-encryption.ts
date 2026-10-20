// Enkripsi file upload saat tersimpan (hardening Tahap 4, docs/08-INVENTARIS-DATA.md): AES-256-GCM.
// Format: "OAE1" | panjang id kunci (1 byte) | id kunci | IV (12 byte) | tag (16 byte) | ciphertext.
// Nama file di storage (key) diikat sebagai AAD → isi file tidak bisa ditukar dengan file lain tanpa ketahuan.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { activeKey, keyById } from "./keys";

const MAGIC = Buffer.from("OAE1", "ascii");

function asBuffer(bytes: Uint8Array): Buffer {
  return Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** File sudah terenkripsi? File lama (PDF/JPG/PNG terbuka) diawali magic bytes formatnya sendiri. */
export function isEncryptedFile(bytes: Uint8Array): boolean {
  return bytes.byteLength > MAGIC.length && asBuffer(bytes).subarray(0, MAGIC.length).equals(MAGIC);
}

/** Id kunci yang dipakai file terenkripsi; null = file belum dienkripsi. */
export function encryptedFileKeyId(bytes: Uint8Array): string | null {
  if (!isEncryptedFile(bytes)) return null;
  const buffer = asBuffer(bytes);
  return buffer.subarray(MAGIC.length + 1, MAGIC.length + 1 + buffer[MAGIC.length]).toString("ascii");
}

export function encryptFile(bytes: Uint8Array, fileKey: string): Buffer {
  const { id, key } = activeKey("file");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(fileKey, "utf8"));
  const data = Buffer.concat([cipher.update(bytes), cipher.final()]);
  const keyId = Buffer.from(id, "ascii");
  return Buffer.concat([MAGIC, Buffer.from([keyId.length]), keyId, iv, cipher.getAuthTag(), data]);
}

/** Buka file terenkripsi. File lama yang belum dienkripsi (sebelum Tahap 4) dikembalikan apa adanya. */
export function decryptFile(bytes: Uint8Array, fileKey: string): Buffer {
  const buffer = asBuffer(bytes);
  if (!isEncryptedFile(buffer)) return buffer;
  const id = encryptedFileKeyId(buffer)!;
  const key = keyById("file", id);
  let offset = MAGIC.length + 1 + id.length;
  try {
    const iv = buffer.subarray(offset, (offset += 12));
    const tag = buffer.subarray(offset, (offset += 16));
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(fileKey, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(buffer.subarray(offset)), decipher.final()]);
  } catch {
    throw new Error(`File ${fileKey} tidak bisa dibuka (kunci "${id}" tidak cocok atau file rusak/ditukar).`);
  }
}
