// Format tampilan (Bahasa Indonesia, zona Asia/Jakarta) & serialisasi uang.
// Dipakai di Server maupun Client Component.

export const APP_TIME_ZONE = "Asia/Jakarta";

const numberFormat = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

/** `1291825` → `Rp 1.291.825`; negatif → `-Rp 1.000`. Menerima number atau BigInt dari DB. */
export function formatRupiah(amount: number | bigint): string {
  const negative = amount < 0;
  const absolute = negative ? -amount : amount;
  return `${negative ? "-" : ""}Rp ${numberFormat.format(absolute)}`;
}

type DateInput = Date | string;

function toDate(value: DateInput): Date {
  return typeof value === "string" ? new Date(value) : value;
}

const dateFormats = {
  long: new Intl.DateTimeFormat("id-ID", { timeZone: APP_TIME_ZONE, day: "numeric", month: "long", year: "numeric" }),
  short: new Intl.DateTimeFormat("id-ID", { timeZone: APP_TIME_ZONE, day: "numeric", month: "short", year: "numeric" }),
  weekday: new Intl.DateTimeFormat("id-ID", {
    timeZone: APP_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }),
};

/**
 * Tanggal Indonesia di zona Asia/Jakarta.
 * `long` → "24 September 2026" (default) · `short` → "24 Sep 2026" · `weekday` → "Kamis, 24 September 2026".
 * Kolom `@db.Date` (UTC tengah malam) tetap tampil di tanggal yang sama.
 */
export function formatDate(value: DateInput, style: keyof typeof dateFormats = "long"): string {
  return dateFormats[style].format(toDate(value));
}

const timeFormat = new Intl.DateTimeFormat("id-ID", {
  timeZone: APP_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "24 Sep 2026, 09:42 WIB". */
export function formatDateTime(value: DateInput): string {
  const date = toDate(value);
  const parts = timeFormat.formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  return `${formatDate(date, "short")}, ${hour}:${minute} WIB`;
}

/** Jam di Jakarta `HH:MM` (24 jam), mis. untuk jam clock in. */
export function formatTime(value: DateInput): string {
  const parts = timeFormat.formatToParts(toDate(value));
  return `${parts.find((part) => part.type === "hour")?.value}:${parts.find((part) => part.type === "minute")?.value}`;
}

// en-CA menghasilkan format YYYY-MM-DD.
const isoDateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE });

/** Tanggal kalender di Jakarta sebagai `YYYY-MM-DD` (mis. untuk "hari ini" dan penomoran bulan). */
export function toJakartaIsoDate(value: DateInput = new Date()): string {
  return isoDateFormat.format(toDate(value));
}

/** NPWP 15 digit → `99.999.999.9-999.999`; 16 digit (format NIK) ditampilkan apa adanya. */
export function formatNpwp(npwp: string): string {
  const match = /^(\d{2})(\d{3})(\d{3})(\d)(\d{3})(\d{3})$/.exec(npwp);
  return match ? `${match[1]}.${match[2]}.${match[3]}.${match[4]}-${match[5]}.${match[6]}` : npwp;
}

/** `+6281234567890` → `0812-3456-7890` (grup 4 digit dari depan). Nilai lain dikembalikan apa adanya. */
export function formatPhone(phone: string): string {
  if (!/^\+62\d+$/.test(phone)) return phone;
  const national = `0${phone.slice(3)}`;
  return national.match(/.{1,4}/g)!.join("-");
}

// ---------------------------------------------------------------------
// Serialisasi uang (BigInt) di boundary server → client
// ---------------------------------------------------------------------

/** Tipe hasil serializeMoney: semua `bigint` (termasuk di dalam object/array) menjadi `number`. */
export type SerializedMoney<T> = T extends bigint
  ? number
  : T extends Date
    ? T
    : T extends readonly (infer U)[]
      ? SerializedMoney<U>[]
      : T extends object
        ? { [K in keyof T]: SerializedMoney<T[K]> }
        : T;

/**
 * Ubah semua BigInt (nominal uang dari Prisma) menjadi number sebelum data dikirim ke
 * Client Component. Date & nilai lain tidak diubah. Error jika nominal melebihi
 * batas aman number (±9 kuadriliun), supaya tidak ada pembulatan diam-diam.
 */
export function serializeMoney<T>(value: T): SerializedMoney<T> {
  return convert(value) as SerializedMoney<T>;
}

function convert(value: unknown): unknown {
  if (typeof value === "bigint") {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
      throw new RangeError(`Nominal ${value} melebihi batas aman untuk dikirim ke client`);
    }
    return Number(value);
  }
  if (value === null || typeof value !== "object" || value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(convert);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, convert(item)]));
}

/** `YYYY-MM-DD` → Date UTC tengah malam, untuk kolom `@db.Date`. */
export function fromIsoDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}

/**
 * Masa kerja untuk tampilan, dihitung di kalender Jakarta: "5 th 7 bln", "3 bln", "< 1 bln".
 * (Perhitungan jatah cuti memakai tahun penuh di services/leave, bukan fungsi ini.)
 */
export function formatTenure(startDate: DateInput, today: DateInput = new Date()): string {
  const [sy, sm, sd] = toJakartaIsoDate(startDate).split("-").map(Number);
  const [ty, tm, td] = toJakartaIsoDate(today).split("-").map(Number);
  let months = (ty - sy) * 12 + (tm - sm) - (td < sd ? 1 : 0);
  if (months < 1) return "< 1 bln";
  const years = Math.floor(months / 12);
  months %= 12;
  return [years && `${years} th`, months && `${months} bln`].filter(Boolean).join(" ");
}
