// Validator & normalisasi input bersama — docs/02-TECH-SPEC.md §5, CLAUDE.md §6.
// Satu schema dipakai di client (react-hook-form) dan server (Server Action).
// Validasi file ada di lib/storage (Tahap 3.4).
import { z } from "zod";

// ---------------------------------------------------------------------
// Normalisasi (fungsi murni, juga dipakai di luar Zod)
// ---------------------------------------------------------------------

/** Hapus semua spasi. */
export function stripSpaces(value: string): string {
  return value.replace(/\s+/g, "");
}

/** Trim, rapikan spasi ganda, lalu Title Case per kata (termasuk setelah `.`, `'`, `-`). */
export function normalizeName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/(^|[\s.'-])(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toUpperCase());
}

/**
 * Nomor HP → `+62…`. Terima `08…`, `62…`, `+62…`, dengan spasi/strip/kurung.
 * Mengembalikan null jika bukan nomor HP Indonesia yang valid.
 * Aturan "10–15 digit" dihitung dari format lokal (`08…`), mis. 081234567890 = 12 digit.
 */
export function normalizePhone(value: string): string | null {
  const cleaned = value.replace(/[\s\-().]/g, "");
  let national: string;
  if (cleaned.startsWith("+62")) national = `0${cleaned.slice(3)}`;
  else if (cleaned.startsWith("62")) national = `0${cleaned.slice(2)}`;
  else national = cleaned;

  if (!/^08\d{8,13}$/.test(national)) return null;
  return `+62${national.slice(1)}`;
}

/** NPWP → hanya digit (hapus `.`, `-`, spasi). */
export function normalizeNpwp(value: string): string {
  return value.replace(/[\s.-]/g, "");
}

/**
 * Nominal Rupiah → integer. Terima angka, `"1250000"`, `"1.250.000"`, `"Rp 1.250.000"`.
 * Mengembalikan null untuk desimal, format ribuan yang salah, atau teks lain.
 */
export function parseRupiah(value: string | number): number | null {
  if (typeof value === "number") return Number.isInteger(value) ? value : null;
  const cleaned = value.replace(/^\s*rp\.?\s*/i, "").trim();
  if (!/^(\d+|\d{1,3}(\.\d{3})+)$/.test(cleaned)) return null;
  const amount = Number(cleaned.replace(/\./g, ""));
  return Number.isSafeInteger(amount) ? amount : null;
}

// ---------------------------------------------------------------------
// Schema Zod
// ---------------------------------------------------------------------

const requiredText = (label: string) => z.string({ error: `${label} wajib diisi` });

/** NIK: tepat 16 digit, spasi dihapus. Keunikan dicek di service. */
export const nikSchema = requiredText("NIK")
  .transform(stripSpaces)
  .pipe(z.string().regex(/^\d{16}$/, { error: "NIK harus 16 digit angka" }));

/** Nomor KK: tepat 16 digit, spasi dihapus. */
export const kkSchema = requiredText("Nomor KK")
  .transform(stripSpaces)
  .pipe(z.string().regex(/^\d{16}$/, { error: "Nomor KK harus 16 digit angka" }));

/** NPWP: 15 atau 16 digit, disimpan tanpa titik/strip. */
export const npwpSchema = requiredText("NPWP")
  .transform(normalizeNpwp)
  .pipe(z.string().regex(/^\d{15,16}$/, { error: "NPWP harus 15 atau 16 digit angka" }));

/** No HP → `+62…`. */
export const phoneSchema = requiredText("Nomor HP").transform((value, ctx) => {
  const phone = normalizePhone(value);
  if (!phone) {
    ctx.addIssue({ code: "custom", message: "Nomor HP tidak valid (contoh: 081234567890)" });
    return z.NEVER;
  }
  return phone;
});

/** Email: trim + lowercase. */
export const emailSchema = requiredText("Email")
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Format email tidak valid" }));

/** Nama orang: 2–100 karakter, dirapikan & Title Case. */
export const personNameSchema = requiredText("Nama")
  .transform(normalizeName)
  .pipe(
    z
      .string()
      .min(2, { error: "Nama minimal 2 karakter" })
      .max(100, { error: "Nama maksimal 100 karakter" }),
  );

/** Serial number: 3–50 karakter, trim + UPPERCASE. Keunikan dicek di service. */
export const serialNumberSchema = requiredText("Serial number")
  .trim()
  .toUpperCase()
  .pipe(
    z
      .string()
      .min(3, { error: "Serial number minimal 3 karakter" })
      .max(50, { error: "Serial number maksimal 50 karakter" }),
  );

/** Nominal Rupiah: integer > 0. Hasil `number`; konversi ke BigInt di service. */
export const amountSchema = z
  .union([z.string(), z.number()], { error: "Nominal wajib diisi" })
  .transform((value, ctx) => {
    const amount = parseRupiah(value);
    if (amount === null) {
      ctx.addIssue({ code: "custom", message: "Nominal harus angka bulat tanpa desimal" });
      return z.NEVER;
    }
    if (amount <= 0) {
      ctx.addIssue({ code: "custom", message: "Nominal harus lebih dari 0" });
      return z.NEVER;
    }
    return amount;
  });

/** Tanggal tanpa jam, format ISO `YYYY-MM-DD` (nilai input type="date"), harus tanggal nyata. */
export const isoDateSchema = requiredText("Tanggal").refine(
  (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  },
  { error: "Tanggal tidak valid" },
);

/**
 * Tambahkan aturan end ≥ start pada object schema. Field end boleh kosong
 * (mis. sertifikat seumur hidup). Error ditempel di field end.
 */
export function withDateRange<T extends z.ZodType<Record<string, unknown>>>(
  schema: T,
  startKey: string,
  endKey: string,
  message = "Tanggal selesai tidak boleh sebelum tanggal mulai",
) {
  return schema.superRefine((data, ctx) => {
    const start = data[startKey];
    const end = data[endKey];
    // Format ISO YYYY-MM-DD bisa dibandingkan sebagai string.
    if (typeof start === "string" && typeof end === "string" && end && end < start) {
      ctx.addIssue({ code: "custom", path: [endKey], message });
    }
  });
}

/** BPJS Ketenagakerjaan: 11 digit (panjang resmi), spasi dihapus. */
export const bpjsTkSchema = requiredText("Nomor BPJS Ketenagakerjaan")
  .transform(stripSpaces)
  .pipe(z.string().regex(/^\d{11}$/, { error: "Nomor BPJS Ketenagakerjaan harus 11 digit angka" }));

/** BPJS Kesehatan: 13 digit (panjang resmi), spasi dihapus. */
export const bpjsKesSchema = requiredText("Nomor BPJS Kesehatan")
  .transform(stripSpaces)
  .pipe(z.string().regex(/^\d{13}$/, { error: "Nomor BPJS Kesehatan harus 13 digit angka" }));

/** Password: minimal 8 karakter (Tech Spec §9). */
export const passwordSchema = requiredText("Password")
  .min(8, { error: "Password minimal 8 karakter" })
  .max(100, { error: "Password maksimal 100 karakter" });

/** Teks bebas: trim, panjang min–max. */
export function textSchema(label: string, { min = 1, max = 100 }: { min?: number; max?: number } = {}) {
  return requiredText(label)
    .trim()
    .min(min, { error: min === 1 ? `${label} wajib diisi` : `${label} minimal ${min} karakter` })
    .max(max, { error: `${label} maksimal ${max} karakter` });
}

/**
 * Field opsional dari form: string kosong/undefined → null (artinya dikosongkan),
 * selain itu divalidasi dengan schema aslinya.
 */
export function optionalField<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (value) => (value === undefined || (typeof value === "string" && value.trim() === "") ? null : value),
    schema.nullable(),
  );
}
