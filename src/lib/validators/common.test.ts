import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  amountSchema,
  emailSchema,
  isoDateSchema,
  kkSchema,
  nikSchema,
  normalizeName,
  npwpSchema,
  personNameSchema,
  phoneSchema,
  serialNumberSchema,
  withDateRange,
} from "@/lib/validators/common";

/** Hasil parse sukses, atau pesan error pertama. */
function parse<T>(schema: z.ZodType<T>, value: unknown): { ok: T } | { error: string } {
  const result = schema.safeParse(value);
  return result.success ? { ok: result.data } : { error: result.error.issues[0].message };
}

describe("NIK & No KK", () => {
  it("16 digit valid, spasi dihapus", () => {
    expect(parse(nikSchema, "3171012345678901")).toEqual({ ok: "3171012345678901" });
    expect(parse(nikSchema, "3171 0123 4567 8901")).toEqual({ ok: "3171012345678901" });
    expect(parse(kkSchema, " 3171012345678901 ")).toEqual({ ok: "3171012345678901" });
  });

  it.each(["317101234567890", "31710123456789012", "31710123456789AB", "3171-0123-4567-8901", ""])(
    "tidak valid: %j",
    (value) => {
      expect(parse(nikSchema, value)).toEqual({ error: "NIK harus 16 digit angka" });
    },
  );

  it("pesan error KK menyebut Nomor KK", () => {
    expect(parse(kkSchema, "123")).toEqual({ error: "Nomor KK harus 16 digit angka" });
  });

  it("wajib diisi", () => {
    expect(parse(nikSchema, undefined)).toEqual({ error: "NIK wajib diisi" });
  });
});

describe("NPWP", () => {
  it("15 digit berformat → hanya digit", () => {
    expect(parse(npwpSchema, "01.234.567.8-901.000")).toEqual({ ok: "012345678901000" });
  });

  it("16 digit (format NIK) valid", () => {
    expect(parse(npwpSchema, "3171012345678901")).toEqual({ ok: "3171012345678901" });
  });

  it.each(["01.234.567.8-901.00", "12345678901234567", "01.234.567.8-901.00A"])("tidak valid: %j", (value) => {
    expect(parse(npwpSchema, value)).toEqual({ error: "NPWP harus 15 atau 16 digit angka" });
  });
});

describe("No HP", () => {
  it.each([
    ["081234567890", "+6281234567890"],
    ["6281234567890", "+6281234567890"],
    ["+6281234567890", "+6281234567890"],
    ["0812-3456-7890", "+6281234567890"],
    ["+62 812 3456 7890", "+6281234567890"],
    ["0812345678", "+62812345678"], // 10 digit (batas bawah)
    ["081234567890123", "+6281234567890123"], // 15 digit (batas atas)
  ])("%j → %j", (input, expected) => {
    expect(parse(phoneSchema, input)).toEqual({ ok: expected });
  });

  it.each([
    "081234567", // 9 digit
    "0812345678901234", // 16 digit
    "0212345678", // telepon rumah, bukan HP
    "81234567890", // tanpa awalan 0/62
    "08123abc890",
    "",
  ])("tidak valid: %j", (value) => {
    expect(parse(phoneSchema, value)).toEqual({ error: "Nomor HP tidak valid (contoh: 081234567890)" });
  });
});

describe("Email", () => {
  it("trim & lowercase", () => {
    expect(parse(emailSchema, "  Andi.Pratama@Artha-Mitra.CO.ID ")).toEqual({ ok: "andi.pratama@artha-mitra.co.id" });
  });

  it.each(["andi", "andi@", "@artha-mitra.co.id", "andi pratama@x.com"])("tidak valid: %j", (value) => {
    expect(parse(emailSchema, value)).toEqual({ error: "Format email tidak valid" });
  });
});

describe("Nama", () => {
  it.each([
    ["  andi   pratama ", "Andi Pratama"],
    ["SINTA LESTARI", "Sinta Lestari"],
    ["ahmad fauzi, s.t.", "Ahmad Fauzi, S.T."],
    ["muhammad al-fatih", "Muhammad Al-Fatih"],
    ["o'neil", "O'Neil"],
  ])("%j → %j", (input, expected) => {
    expect(normalizeName(input)).toBe(expected);
    expect(parse(personNameSchema, input)).toEqual({ ok: expected });
  });

  it("minimal 2 karakter (setelah trim)", () => {
    expect(parse(personNameSchema, " a ")).toEqual({ error: "Nama minimal 2 karakter" });
  });

  it("maksimal 100 karakter", () => {
    expect(parse(personNameSchema, "a".repeat(101))).toEqual({ error: "Nama maksimal 100 karakter" });
  });
});

describe("Serial number", () => {
  it("trim & UPPERCASE", () => {
    expect(parse(serialNumberSchema, "  cs-2901-x7718a ")).toEqual({ ok: "CS-2901-X7718A" });
  });

  it("3–50 karakter", () => {
    expect(parse(serialNumberSchema, "ab")).toEqual({ error: "Serial number minimal 3 karakter" });
    expect(parse(serialNumberSchema, "a".repeat(51))).toEqual({ error: "Serial number maksimal 50 karakter" });
  });
});

describe("Nominal", () => {
  it.each([
    ["1.250.000", 1_250_000],
    ["1250000", 1_250_000],
    ["Rp 1.250.000", 1_250_000],
    ["Rp1.250.000", 1_250_000],
    [" 450.000 ", 450_000],
    [890_000, 890_000],
    ["1", 1],
  ])("%j → %j", (input, expected) => {
    expect(parse(amountSchema, input)).toEqual({ ok: expected });
  });

  it.each(["1.250.000,50", "1250000.5", "1,5", "12.50", "1.2345", "abc", "", 12.5])("bukan bulat: %j", (value) => {
    expect(parse(amountSchema, value)).toEqual({ error: "Nominal harus angka bulat tanpa desimal" });
  });

  it.each(["0", 0, -5000])("harus > 0: %j", (value) => {
    expect(parse(amountSchema, value)).toEqual({ error: "Nominal harus lebih dari 0" });
  });
});

describe("Tanggal & rentang", () => {
  it("ISO date valid", () => {
    expect(parse(isoDateSchema, "2026-09-24")).toEqual({ ok: "2026-09-24" });
    expect(parse(isoDateSchema, "2028-02-29")).toEqual({ ok: "2028-02-29" });
  });

  it.each(["2026-02-30", "2026-13-01", "24/09/2026", "2026-9-24", ""])("tidak valid: %j", (value) => {
    expect(parse(isoDateSchema, value)).toEqual({ error: "Tanggal tidak valid" });
  });

  const rangeSchema = withDateRange(
    z.object({ startDate: isoDateSchema, endDate: isoDateSchema.optional() }),
    "startDate",
    "endDate",
  );

  it("end ≥ start valid, termasuk hari yang sama", () => {
    expect(rangeSchema.safeParse({ startDate: "2026-09-24", endDate: "2026-09-30" }).success).toBe(true);
    expect(rangeSchema.safeParse({ startDate: "2026-09-24", endDate: "2026-09-24" }).success).toBe(true);
  });

  it("end kosong diizinkan (mis. sertifikat seumur hidup)", () => {
    expect(rangeSchema.safeParse({ startDate: "2026-09-24" }).success).toBe(true);
  });

  it("end < start ditolak dengan error di field end", () => {
    const result = rangeSchema.safeParse({ startDate: "2026-09-24", endDate: "2026-09-23" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      path: ["endDate"],
      message: "Tanggal selesai tidak boleh sebelum tanggal mulai",
    });
  });
});
