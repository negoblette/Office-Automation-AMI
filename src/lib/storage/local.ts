import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FileExtension } from "./validate";

export interface Storage {
  /** Simpan file, kembalikan key unik (`<uuid>.<ext>`). */
  put(data: Uint8Array, ext: FileExtension): Promise<string>;
  /** Baca file; error jika key tidak valid atau file tidak ada. */
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}

const KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$/;

/** Key hanya boleh `<uuid>.<pdf|jpg|png>` — mencegah path traversal (`../`). */
export function isValidFileKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

export class FileNotFoundError extends Error {
  constructor(key: string) {
    super(`File tidak ditemukan: ${key}`);
  }
}

/** Penyimpanan di disk lokal (UPLOAD_DIR). Siap diganti S3Storage dengan interface yang sama. */
export class LocalStorage implements Storage {
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = path.resolve(dir);
  }

  private pathOf(key: string): string {
    if (!isValidFileKey(key)) throw new FileNotFoundError(key);
    return path.join(this.dir, key);
  }

  async put(data: Uint8Array, ext: FileExtension): Promise<string> {
    const key = `${randomUUID()}.${ext}`;
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.pathOf(key), data, { flag: "wx" });
    return key;
  }

  async get(key: string): Promise<Uint8Array> {
    try {
      return await readFile(this.pathOf(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new FileNotFoundError(key);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }
}
