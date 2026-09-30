import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FileNotFoundError, isValidFileKey, LocalStorage } from "@/lib/storage/local";
import { detectFileType, validateUpload } from "@/lib/storage/validate";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a]); // %PDF-1.7
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const GIF = new TextEncoder().encode("GIF89a....");
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]); // MZ
const TEXT = new TextEncoder().encode("ini file teks yang diganti namanya jadi .pdf");

describe("validateUpload", () => {
  it.each([
    ["PDF", PDF, "pdf", "application/pdf"],
    ["PNG", PNG, "png", "image/png"],
    ["JPG", JPG, "jpg", "image/jpeg"],
  ])("%s diterima (dideteksi dari isi)", (_, bytes, ext, mimeType) => {
    expect(validateUpload(bytes)).toEqual({ ok: true, ext, mimeType });
  });

  it.each([
    ["GIF", GIF],
    ["EXE", EXE],
    ["teks berekstensi .pdf", TEXT],
  ])("%s ditolak", (_, bytes) => {
    expect(validateUpload(bytes)).toEqual({ ok: false, error: "File harus berupa PDF, JPG, atau PNG" });
  });

  it("file kosong ditolak", () => {
    expect(validateUpload(new Uint8Array())).toEqual({ ok: false, error: "File kosong" });
  });

  it("> 5 MB ditolak, tepat 5 MB diterima", () => {
    const limit = 5 * 1024 * 1024;
    const exact = new Uint8Array(limit);
    exact.set(PDF);
    const tooBig = new Uint8Array(limit + 1);
    tooBig.set(PDF);

    expect(validateUpload(exact, limit).ok).toBe(true);
    expect(validateUpload(tooBig, limit)).toEqual({ ok: false, error: "Ukuran file maksimal 5 MB" });
  });

  it("detectFileType tidak tertipu byte yang terlalu pendek", () => {
    expect(detectFileType(new Uint8Array([0x25, 0x50]))).toBeNull();
  });
});

describe("isValidFileKey", () => {
  it.each(["0b8f7c1e-2f3a-4c5d-9e8f-0123456789ab.pdf", "0b8f7c1e-2f3a-4c5d-9e8f-0123456789ab.png"])("valid: %s", (key) => {
    expect(isValidFileKey(key)).toBe(true);
  });

  it.each([
    "../.env",
    "..%2F.env",
    "0b8f7c1e-2f3a-4c5d-9e8f-0123456789ab.exe",
    "0b8f7c1e-2f3a-4c5d-9e8f-0123456789ab.pdf/../../x",
    "sub/0b8f7c1e-2f3a-4c5d-9e8f-0123456789ab.pdf",
    "",
  ])("tidak valid: %j", (key) => {
    expect(isValidFileKey(key)).toBe(false);
  });
});

describe("LocalStorage", () => {
  let dir: string;
  let storage: LocalStorage;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "oa-storage-"));
    storage = new LocalStorage(path.join(dir, "uploads"));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("put → key UUID unik, get mengembalikan isi yang sama", async () => {
    const key1 = await storage.put(PDF, "pdf");
    const key2 = await storage.put(PDF, "pdf");

    expect(isValidFileKey(key1)).toBe(true);
    expect(key1).not.toBe(key2);
    expect(new Uint8Array(await storage.get(key1))).toEqual(PDF);
  });

  it("delete menghapus file; get setelahnya → FileNotFoundError", async () => {
    const key = await storage.put(PNG, "png");
    await storage.delete(key);

    await expect(storage.get(key)).rejects.toBeInstanceOf(FileNotFoundError);
    expect(await readdir(path.join(dir, "uploads"))).not.toContain(key);
  });

  it("key berbahaya ditolak tanpa menyentuh disk", async () => {
    await expect(storage.get("../../.env")).rejects.toBeInstanceOf(FileNotFoundError);
    await expect(storage.delete("../../.env")).rejects.toBeInstanceOf(FileNotFoundError);
  });
});
