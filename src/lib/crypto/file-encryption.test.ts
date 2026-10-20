import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptFile, encryptedFileKeyId, encryptFile, isEncryptedFile } from "@/lib/crypto/file-encryption";

const KEY = "0b8f7c1e-2f3a-4c5d-9e8f-0123456789ab.pdf";
const OTHER_KEY = "1c9a8d2f-3a4b-4d6e-8f9a-123456789abc.pdf";
const PDF = new TextEncoder().encode("%PDF-1.7\nscan KTP contoh 9901012345678901");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("encryptFile / decryptFile", () => {
  it("berheader OAE1, tidak memuat isi asli, dan kembali utuh", () => {
    const sealed = encryptFile(PDF, KEY);
    expect(sealed.subarray(0, 4).toString("ascii")).toBe("OAE1");
    expect(sealed.includes(Buffer.from("9901012345678901"))).toBe(false);
    expect(isEncryptedFile(sealed)).toBe(true);
    expect(encryptedFileKeyId(sealed)).toBe("t1");
    expect(new Uint8Array(decryptFile(sealed, KEY))).toEqual(PDF);
  });

  it("file yang ditukar ke nama (key) lain ketahuan", () => {
    expect(() => decryptFile(encryptFile(PDF, KEY), OTHER_KEY)).toThrow("tidak bisa dibuka");
  });

  it("isi yang diubah ketahuan", () => {
    const sealed = encryptFile(PDF, KEY);
    sealed[sealed.length - 1] ^= 1;
    expect(() => decryptFile(sealed, KEY)).toThrow("tidak bisa dibuka");
  });

  it("file lama (PDF/PNG/JPG terbuka) dibaca apa adanya", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    for (const bytes of [PDF, png, new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00])]) {
      expect(isEncryptedFile(bytes)).toBe(false);
      expect(encryptedFileKeyId(bytes)).toBeNull();
      expect(new Uint8Array(decryptFile(bytes, KEY))).toEqual(bytes);
    }
  });

  it("rotasi: file berkunci lama tetap terbuka, file baru memakai kunci baru", () => {
    const old = encryptFile(PDF, KEY);
    vi.stubEnv("DATA_ENCRYPTION_KEYS", `t2:EVcgw0svJPvdbAFKd4L6jx4vtLX3cRuv4AMGc+8K1/0=,${process.env.DATA_ENCRYPTION_KEYS}`);
    expect(encryptedFileKeyId(encryptFile(PDF, KEY))).toBe("t2");
    expect(new Uint8Array(decryptFile(old, KEY))).toEqual(PDF);
  });
});
