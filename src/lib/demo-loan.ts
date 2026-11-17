// Peminjaman unit demo / Product Trial Form (Fase 16, 2026-11-17) — aturan murni tanpa database, dipakai server & client.
import type { DemoLoanStatus, LoanPurpose } from "@/generated/prisma/enums";
import type { StatusVariant } from "@/components/shared/status-badge";

/** Status yang menahan unit: unit di peminjaman ini tidak bisa diajukan di peminjaman lain. */
export const ACTIVE_LOAN_STATUSES = ["PENDING", "APPROVED", "ON_LOAN"] as const satisfies readonly DemoLoanStatus[];

export function isActiveLoanStatus(status: DemoLoanStatus): boolean {
  return (ACTIVE_LOAN_STATUSES as readonly DemoLoanStatus[]).includes(status);
}

/** Pemohon masih bisa mengubah / membatalkan selama belum disetujui (ubah: juga belum ada level yang menyetujui). */
export function isEditableLoanStatus(status: DemoLoanStatus): boolean {
  return status === "PENDING" || status === "REJECTED";
}

export const LOAN_PURPOSE_LABEL: Record<LoanPurpose, string> = {
  BACKUP_UNIT: "Backup Unit",
  POC: "POC",
  OTHER: "Lainnya",
};

/** Penjelasan singkat di form & detail. */
export const LOAN_PURPOSE_HINT: Record<LoanPurpose, string> = {
  BACKUP_UNIT: "Pengganti sementara unit customer yang bermasalah",
  POC: "Unit untuk pengujian (proof of concept) di customer",
  OTHER: "Kegunaan lain — tulis detailnya",
};

/** Kegunaan untuk tampilan ringkas: "Backup Unit", "POC", atau detail isian pengaju untuk "Lainnya". */
export function loanPurposeText(purpose: LoanPurpose, detail: string | null | undefined): string {
  return purpose === "OTHER" ? (detail?.trim() || LOAN_PURPOSE_LABEL.OTHER) : LOAN_PURPOSE_LABEL[purpose];
}

/** Penjelasan kegunaan: keterangan bawaan, atau detail isian pengaju untuk "Lainnya". */
export function loanPurposeDescription(purpose: LoanPurpose, detail: string | null | undefined): string {
  return purpose === "OTHER" ? (detail?.trim() || LOAN_PURPOSE_HINT.OTHER) : LOAN_PURPOSE_HINT[purpose];
}

export const DEMO_LOAN_STATUS_LABEL: Record<DemoLoanStatus, string> = {
  PENDING: "Menunggu approval",
  APPROVED: "Disiapkan",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
  ON_LOAN: "Dipinjam",
  RETURNED: "Selesai",
};

export const DEMO_LOAN_STATUS_VARIANT: Record<DemoLoanStatus, StatusVariant> = {
  PENDING: "pending",
  APPROVED: "info",
  REJECTED: "danger",
  CANCELLED: "neutral",
  ON_LOAN: "warning",
  RETURNED: "success",
};

/** Jangka pinjam paling lama (bulan) sejak tanggal mulai. */
export const MAX_LOAN_MONTHS = 24;

/** Unit maksimal dalam satu form. */
export const MAX_LOAN_ITEMS = 50;

/** "Sales Person" di form dipilih dari karyawan aktif divisi ini (kode persis). */
export const LOAN_SALES_DIVISION = "SALES";

const DAY_MS = 86_400_000;

function parseIso(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

const toIso = (date: Date) => date.toISOString().slice(0, 10);

export function addDaysIso(iso: string, days: number): string {
  return toIso(new Date(parseIso(iso).getTime() + days * DAY_MS));
}

/** Tambah bulan; tanggal yang tidak ada di bulan tujuan dijepit ke akhir bulan (31 Jan + 1 bulan → 28/29 Feb). */
export function addMonthsIso(iso: string, months: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return toIso(target);
}

/** Selisih hari kalender `toIso − fromIso` (negatif bila sudah lewat). */
export function daysBetween(fromIso: string, toIsoDate: string): number {
  return Math.round((parseIso(toIsoDate).getTime() - parseIso(fromIso).getTime()) / DAY_MS);
}

// ---------------------------------------------------------------------
// Jangka pinjam = tanggal mulai s/d tanggal selesai (inklusif), lamanya dihitung tahun / bulan / hari (2026-11-17).
// ---------------------------------------------------------------------

export type LoanSpan = { years: number; months: number; days: number };

/**
 * Lama pinjam dari tanggal mulai s/d tanggal selesai, keduanya ikut dihitung (seperti form kertas: 14 Mar – 13 Apr =
 * 1 bulan; 20 Nov – 3 Des = 14 hari; 17 Nov – 31 Des = 1 bulan 15 hari). Bulan penuh dihitung dengan tanggal yang sama
 * di bulan berikutnya (dijepit ke akhir bulan), sisanya hari.
 */
export function loanSpan(startIso: string, endIso: string): LoanSpan {
  const after = addDaysIso(endIso, 1); // hari setelah hari terakhir
  let months = 0;
  while (months < 1200 && addMonthsIso(startIso, months + 1) <= after) months++;
  const days = daysBetween(addMonthsIso(startIso, months), after);
  return { years: Math.floor(months / 12), months: months % 12, days };
}

const spanParts = (span: LoanSpan, labels: [singular: string, plural: string][]) =>
  ([span.years, span.months, span.days] as const)
    .map((value, index) => (value ? `${value} ${value === 1 ? labels[index][0] : labels[index][1]}` : null))
    .filter(Boolean)
    .join(" ") || `0 ${labels[2][1]}`;

/** "1 tahun 2 bulan 5 hari", "14 hari", "1 bulan" — bagian yang nol tidak ditulis. */
export function formatLoanDuration(startIso: string, endIso: string): string {
  return spanParts(loanSpan(startIso, endIso), [
    ["tahun", "tahun"],
    ["bulan", "bulan"],
    ["hari", "hari"],
  ]);
}

/** Tanggal selesai paling lambat: 2 tahun sejak tanggal mulai (hari terakhirnya). */
export function maxLoanEnd(startIso: string): string {
  return addDaysIso(addMonthsIso(startIso, MAX_LOAN_MONTHS), -1);
}

/** Tanggal selesai bawaan di form: 1 bulan (hari terakhirnya). */
export function defaultLoanEnd(startIso: string): string {
  return addDaysIso(addMonthsIso(startIso, 1), -1);
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

export function romanMonth(month: number): string {
  const roman = ROMAN[month - 1];
  if (!roman) throw new RangeError(`Bulan tidak valid: ${month}`);
  return roman;
}

/** Nomor Product Trial Form: `001/AMI-PTF/XI/2026` (urut per tahun; bulan = bulan disetujui). */
export function formatTrialFormNumber(sequence: number, month: number, year: number): string {
  return `${String(sequence).padStart(3, "0")}/AMI-PTF/${romanMonth(month)}/${year}`;
}

/** Urutan dari nomor form, mis. "008/AMI-PTF/III/2025" → { sequence: 8, year: 2025 }; null bila formatnya lain. */
export function parseTrialFormNumber(number: string): { sequence: number; year: number } | null {
  const match = /^(\d+)\/AMI-PTF\/[IVX]+\/(\d{4})$/.exec(number);
  return match ? { sequence: Number(match[1]), year: Number(match[2]) } : null;
}

// ---------------------------------------------------------------------
// Form cetak (Product Trial Form, Fase 16.3) — label berbahasa Inggris seperti form kertas.
// ---------------------------------------------------------------------

const englishDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** "2026-03-14" → "14 March 2026". */
export function formatEnglishDate(iso: string): string {
  return englishDate.format(new Date(`${iso}T00:00:00Z`));
}

/** "1 Month (13 April 2025)", "1 Year 2 Months 5 Days (…)" — lama pinjam + hari terakhir, seperti kolom Trial Periode. */
export function formatTrialPeriod(startIso: string, endIso: string): string {
  const span = spanParts(loanSpan(startIso, endIso), [
    ["Year", "Years"],
    ["Month", "Months"],
    ["Day", "Days"],
  ]);
  return `${span} (${formatEnglishDate(endIso)})`;
}

/** Kelompokkan unit per part number untuk tabel form (Item · Qty · S/N), urutan kemunculan dipertahankan. */
export function groupLoanItems<T extends { deviceName: string; serialNo: string }>(items: T[]): { deviceName: string; serials: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const item of items) groups.set(item.deviceName, [...(groups.get(item.deviceName) ?? []), item.serialNo]);
  return [...groups].map(([deviceName, serials]) => ({ deviceName, serials }));
}
