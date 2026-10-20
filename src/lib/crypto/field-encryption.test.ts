import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptText, encryptedKeyId, encryptText, isEncryptedValue, nikIndex } from "@/lib/crypto/field-encryption";

// Kunci test "t1" diisi di vitest.config.mts; "t2" = kunci baru untuk uji rotasi.
const T1 = process.env.DATA_ENCRYPTION_KEYS!;
const T2 = "t2:EVcgw0svJPvdbAFKd4L6jx4vtLX3cRuv4AMGc+8K1/0=";
const NIK = "3171012345678901";

/** Ubah satu byte bagian ke-`part` ciphertext (2 = data, 3 = tag). */
function tamper(sealed: string, part: 2 | 3): string {
  const parts = sealed.split(":");
  const bytes = Buffer.from(parts[part], "base64url");
  bytes[0] ^= 1;
  parts[part] = bytes.toString("base64url");
  return parts.join(":");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("encryptText / decryptText", () => {
  it("terenkripsi lalu kembali utuh; ciphertext tidak memuat nilai asli", () => {
    const sealed = encryptText(NIK);
    expect(sealed).toMatch(/^t1:/);
    expect(sealed).not.toContain(NIK);
    expect(isEncryptedValue(sealed)).toBe(true);
    expect(decryptText(sealed)).toBe(NIK);
  });

  it("IV acak: nilai yang sama menghasilkan ciphertext berbeda", () => {
    expect(encryptText("Jl. Melati 1")).not.toBe(encryptText("Jl. Melati 1"));
  });

  it("teks non-ASCII & panjang tetap utuh", () => {
    const text = "Kakak kandung · Ibu Siti Ñoño ".repeat(10);
    expect(decryptText(encryptText(text))).toBe(text);
  });

  it("null, undefined, dan string kosong tidak dienkripsi (kolom kosong tetap kosong)", () => {
    expect(encryptText(null)).toBeNull();
    expect(encryptText(undefined)).toBeUndefined();
    expect(encryptText("")).toBe("");
    expect(decryptText(null)).toBeNull();
    expect(decryptText("")).toBe("");
  });

  it("nilai lama yang belum dienkripsi dibaca apa adanya", () => {
    for (const value of [NIK, "+6281234567890", "1990-05-17", "Kakak", "Budi Pratama"]) {
      expect(isEncryptedValue(value)).toBe(false);
      expect(decryptText(value)).toBe(value);
    }
  });

  it("ciphertext atau tag yang diubah ketahuan", () => {
    const sealed = encryptText(NIK);
    expect(() => decryptText(tamper(sealed, 2))).toThrow("tidak bisa dibuka");
    expect(() => decryptText(tamper(sealed, 3))).toThrow("tidak bisa dibuka");
  });

  it("kunci yang sudah tidak ada di DATA_ENCRYPTION_KEYS → error jelas", () => {
    const sealed = encryptText(NIK);
    vi.stubEnv("DATA_ENCRYPTION_KEYS", T2);
    expect(() => decryptText(sealed)).toThrow('kunci "t1" yang tidak ada di DATA_ENCRYPTION_KEYS');
  });
});

describe("rotasi kunci", () => {
  it("kunci baru di depan: data baru memakai kunci baru, data lama tetap terbuka", () => {
    const old = encryptText(NIK);
    vi.stubEnv("DATA_ENCRYPTION_KEYS", `${T2},${T1}`);
    const fresh = encryptText(NIK);

    expect(encryptedKeyId(old)).toBe("t1");
    expect(encryptedKeyId(fresh)).toBe("t2");
    expect(decryptText(old)).toBe(NIK);
    expect(decryptText(fresh)).toBe(NIK);
    expect(encryptedKeyId(NIK)).toBeNull();
  });
});

describe("konfigurasi kunci", () => {
  it.each([
    ["kosong", ""],
    ["tanpa id kunci", T1.slice(3)],
    ["bukan 32 byte", "v1:YWJjZGVm"],
    ["id kunci ganda", `${T1},${T1}`],
  ])("%s → ditolak dengan pesan jelas tanpa membocorkan kunci", (_, value) => {
    vi.stubEnv("DATA_ENCRYPTION_KEYS", value);
    expect(() => encryptText("x")).toThrow(/DATA_ENCRYPTION_KEYS/);
    try {
      encryptText("x");
    } catch (error) {
      expect((error as Error).message).not.toContain("YWJjZGVm");
      expect((error as Error).message).not.toContain(T1.slice(3));
    }
  });
});

describe("nikIndex (sidik jari NIK)", () => {
  it("tetap untuk NIK yang sama, berbeda untuk NIK lain, tidak memuat NIK", () => {
    expect(nikIndex(NIK)).toBe(nikIndex(NIK));
    expect(nikIndex(NIK)).not.toBe(nikIndex("3171012345678902"));
    expect(nikIndex(NIK)).not.toContain("3171");
  });

  it("bergantung pada DATA_INDEX_KEY", () => {
    const before = nikIndex(NIK);
    vi.stubEnv("DATA_INDEX_KEY", T2.slice(3));
    expect(nikIndex(NIK)).not.toBe(before);
  });

  it("DATA_INDEX_KEY kosong → error jelas", () => {
    vi.stubEnv("DATA_INDEX_KEY", "");
    expect(() => nikIndex(NIK)).toThrow("DATA_INDEX_KEY belum diisi");
  });
});
