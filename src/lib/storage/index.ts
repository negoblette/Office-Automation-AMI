import "server-only";
import { FileNotFoundError, isValidFileKey, LocalStorage, type Storage } from "./local";
import { type FileExtension, MIME_TYPES, validateUpload } from "./validate";

export { FileNotFoundError, isValidFileKey, type Storage } from "./local";
export { MAX_UPLOAD_MB, MIME_TYPES } from "./validate";

let storage: Storage | undefined;

/** Storage sesuai STORAGE_DRIVER (saat ini hanya `local`). */
export function getStorage(): Storage {
  if (!storage) {
    const driver = process.env.STORAGE_DRIVER ?? "local";
    if (driver !== "local") throw new Error(`STORAGE_DRIVER "${driver}" belum didukung`);
    storage = new LocalStorage(process.env.UPLOAD_DIR ?? "./storage/uploads");
  }
  return storage;
}

export type StoredFile = { key: string; fileName: string; mimeType: string; sizeBytes: number };

export type SaveUploadResult = { ok: true; file: StoredFile } | { ok: false; error: string };

/**
 * Validasi lalu simpan file dari form (Server Action). Nama asli hanya dipakai untuk
 * tampilan/unduhan; file disimpan dengan nama UUID.
 */
export async function saveUpload(file: File): Promise<SaveUploadResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateUpload(bytes);
  if (!validation.ok) return validation;

  const key = await getStorage().put(bytes, validation.ext);
  return {
    ok: true,
    file: { key, fileName: file.name, mimeType: validation.mimeType, sizeBytes: bytes.length },
  };
}

/**
 * Info file yang sudah di-upload, dibaca dari storage (bukan dari data browser).
 * null jika key tidak valid atau file tidak ada.
 */
export async function inspectStoredFile(key: string): Promise<{ mimeType: string; sizeBytes: number } | null> {
  if (!isValidFileKey(key)) return null;
  try {
    const bytes = await getStorage().get(key);
    return { mimeType: MIME_TYPES[key.split(".").pop() as FileExtension], sizeBytes: bytes.length };
  } catch (error) {
    if (error instanceof FileNotFoundError) return null;
    throw error;
  }
}
