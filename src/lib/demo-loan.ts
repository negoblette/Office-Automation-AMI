// Peminjaman unit demo / Product Trial Form (Fase 16, 2026-11-17) — aturan murni tanpa database, dipakai server & client.
import type { DemoLoanExtensionStatus, DemoLoanStatus, LoanPurpose, ReturnCondition } from "@/generated/prisma/enums";
import type { StatusVariant } from "@/components/shared/status-badge";

/**
 * Status yang menahan unit: unit di peminjaman ini tidak bisa diajukan di peminjaman lain. PICKUP (2026-11-19) = barang
 * sedang diambil kurir / belum dicek Operational; RETURN_REVIEW (2026-11-20) = hasil pengecekan menunggu verifikasi
 * engineer — unit masih tertahan. FOLLOW_UP juga menahan semua unit (services/demo-loan-hold.ts, revisi 2026-11-20).
 */
export const ACTIVE_LOAN_STATUSES = ["PENDING", "APPROVED", "ON_LOAN", "PICKUP", "RETURN_REVIEW"] as const satisfies readonly DemoLoanStatus[];

/** Barang ada di luar AMI (di peminjam atau dalam perjalanan pulang). */
export const OUT_LOAN_STATUSES = ["ON_LOAN", "PICKUP"] as const satisfies readonly DemoLoanStatus[];

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
  PICKUP: "Pengambilan",
  RETURN_REVIEW: "Menunggu verifikasi",
  FOLLOW_UP: "Tindak lanjut",
  RETURNED: "Selesai",
};

export const DEMO_LOAN_STATUS_VARIANT: Record<DemoLoanStatus, StatusVariant> = {
  PENDING: "pending",
  APPROVED: "info",
  REJECTED: "danger",
  CANCELLED: "neutral",
  ON_LOAN: "warning",
  PICKUP: "info",
  RETURN_REVIEW: "pending",
  FOLLOW_UP: "danger",
  RETURNED: "success",
};

/** Jangka pinjam paling lama (bulan) sejak tanggal mulai. */
export const MAX_LOAN_MONTHS = 24;

/** Unit maksimal dalam satu form. */
export const MAX_LOAN_ITEMS = 50;

// ---------------------------------------------------------------------
// Pemilik di nomor form (2026-11-19): `NNN/AMI-PTF/<pemilik>/<tahun>`. Sejak 2026-11-20 peminjaman ke customer selalu
// "AMI" (barang titipan principal / distributor milik AMI untuk sementara); HAF penerimaan & pengembalian barang memakai
// nama principal / distributor.
// ---------------------------------------------------------------------

export const AMI_OWNER = "AMI";

/** Contoh segmen pemilik untuk pratinjau nomor berikutnya di Setting (pemilik baru diketahui saat diajukan). */
export const OWNER_PLACEHOLDER = "pemilik";

/** Nama pemilik yang aman untuk nomor form: "/" (pemisah nomor) diganti "-", spasi dirapikan. */
export function cleanOwnerName(name: string): string {
  return name.replaceAll("/", "-").replace(/\s+/g, " ").trim();
}



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

/**
 * Tanggal diantar paling awal: tanggal mulai atau tanggal pengajuan, mana yang lebih dulu. Sejak tanggal mulai boleh
 * lampau (2026-11-25), peminjaman yang dicatat belakangan bisa mencatat tanggal antar sebelum diajukan di sistem.
 */
export function earliestDeliveryIso(startIso: string, submittedIso: string): string {
  return startIso < submittedIso ? startIso : submittedIso;
}

/** Tanggal selesai paling lambat: 2 tahun sejak tanggal mulai (hari terakhirnya). */
export function maxLoanEnd(startIso: string): string {
  return addDaysIso(addMonthsIso(startIso, MAX_LOAN_MONTHS), -1);
}

/** Tanggal selesai bawaan di form: 1 bulan (hari terakhirnya). */
export function defaultLoanEnd(startIso: string): string {
  return addDaysIso(addMonthsIso(startIso, 1), -1);
}

// ---------------------------------------------------------------------
// Peringatan jatuh tempo (Tahap 16.4, 2026-11-18). Jatuh tempo = hari terakhir pinjam; terlambat mulai besoknya.
// ---------------------------------------------------------------------

/** Peringatan "akan jatuh tempo" mulai H-7 (email & lonceng). */
export const DUE_SOON_DAYS = 7;
/** Selama masih terlambat, email diulang tiap 7 hari (H+1, H+8, H+15, …). */
export const OVERDUE_REPEAT_DAYS = 7;

/** Sisa hari ke jatuh tempo: 0 = hari ini, 1 = besok, negatif = sudah terlambat sekian hari. */
export function daysUntilDue(dueIso: string, todayIso: string): number {
  return daysBetween(todayIso, dueIso);
}

/**
 * Tahap email pengingat yang berlaku hari ini untuk peminjaman yang sedang Dipinjam, sebagai hari relatif terhadap
 * jatuh tempo: -7 (7 hari lagi), -1 (besok / hari ini), 1 (terlambat), 8, 15, … (masih terlambat). null = belum waktunya.
 * Hanya tahap TERBARU yang dikembalikan, jadi worker yang mati beberapa hari tidak mengirim email yang menumpuk.
 * Tahap -7 dilewati bila jangka pinjamnya pendek (H-7 jatuh sebelum tanggal mulai).
 */
export function dueReminderStage(startIso: string, dueIso: string, todayIso: string): number | null {
  const left = daysUntilDue(dueIso, todayIso);
  if (left < 0) return 1 + Math.floor((-left - 1) / OVERDUE_REPEAT_DAYS) * OVERDUE_REPEAT_DAYS;
  if (left <= 1) return -1;
  if (left <= DUE_SOON_DAYS && addDaysIso(dueIso, -DUE_SOON_DAYS) >= startIso) return -DUE_SOON_DAYS;
  return null;
}

/** "hari ini", "besok", "5 hari lagi", "terlambat 3 hari". */
export function dueLabel(daysLeft: number): string {
  if (daysLeft < 0) return `terlambat ${-daysLeft} hari`;
  if (daysLeft === 0) return "hari ini";
  if (daysLeft === 1) return "besok";
  return `${daysLeft} hari lagi`;
}

/** Tahap lonceng: muncul lagi saat naik tahap (akan jatuh tempo → terlambat → tiap 7 hari masih terlambat). */
export function dueNotificationStage(daysLeft: number): string | null {
  if (daysLeft < 0) return `overdue-${Math.floor((-daysLeft - 1) / OVERDUE_REPEAT_DAYS)}`;
  return daysLeft <= DUE_SOON_DAYS ? "soon" : null;
}

/** Perpanjangan: jatuh tempo baru harus setelah jatuh tempo sekarang, tidak sebelum hari ini, dan maks. 2 tahun dari mulai. */
export function extensionDueError(input: { startIso: string; currentDueIso: string; newDueIso: string; todayIso: string }): string | null {
  if (input.newDueIso <= input.currentDueIso) return "Tanggal selesai baru harus setelah jatuh tempo sekarang";
  if (input.newDueIso < input.todayIso) return "Tanggal selesai baru tidak boleh sebelum hari ini";
  if (input.newDueIso > maxLoanEnd(input.startIso)) return "Jangka pinjam maksimal 2 tahun sejak tanggal mulai";
  return null;
}

export const EXTENSION_STATUS_LABEL: Record<DemoLoanExtensionStatus, string> = {
  PENDING: "Menunggu approval",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
};

export const EXTENSION_STATUS_VARIANT: Record<DemoLoanExtensionStatus, StatusVariant> = {
  PENDING: "pending",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

const formNumber = (sequence: number, code: string, owner: string, year: number) =>
  `${String(sequence).padStart(3, "0")}/AMI-${code}/${cleanOwnerName(owner)}/${year}`;

/** Nomor Product Trial Form: `008/AMI-PTF/AMI/2025`, `009/AMI-PTF/Cisco/2025` (urut per tahun; segmen 3 = pemilik unit). */
export function formatTrialFormNumber(sequence: number, owner: string, year: number): string {
  return formNumber(sequence, "PTF", owner, year);
}

/**
 * Urutan & tahun dari nomor form, mis. "008/AMI-PTF/AMI/2025" → { sequence: 8, year: 2025 }; segmen tengah apa pun
 * (nomor lama berisi bulan Romawi tetap terbaca). null bila formatnya lain.
 */
export function parseTrialFormNumber(number: string): { sequence: number; year: number } | null {
  const match = /^(\d+)\/AMI-PTF\/[^/]*\/(\d{4})$/.exec(number);
  return match ? { sequence: Number(match[1]), year: Number(match[2]) } : null;
}

/** Nomor Hardware Admission Form: `001/AMI-HAF/AMI/2026` (urut per tahun; segmen 3 = pemilik unit). */
export function formatHafNumber(sequence: number, owner: string, year: number): string {
  return formNumber(sequence, "HAF", owner, year);
}

/** Urutan & tahun dari nomor HAF (segmen tengah apa pun, termasuk nomor lama yang kosong); null bila formatnya lain. */
export function parseHafNumber(number: string): { sequence: number; year: number } | null {
  const match = /^(\d+)\/AMI-HAF\/[^/]*\/(\d{4})$/.exec(number);
  return match ? { sequence: Number(match[1]), year: Number(match[2]) } : null;
}

// ---------------------------------------------------------------------
// Pengambilan & Pengecekan Unit (2026-11-19): Operational menjadwalkan pengambilan → HAF terbit & dibawa kurir AMI;
// setelah barang tiba di AMI, Operational wajib mengisi Pengecekan Unit (kondisi tiap unit & posisi rak).
// ---------------------------------------------------------------------

/** Tanggal pengambilan paling jauh 90 hari ke depan. */
export const MAX_PICKUP_AHEAD_DAYS = 90;

/** Kondisi unit saat dicek Operational (Tahap 16.5). HAF tidak memuat kondisi sejak 2026-11-19 (terbit sebelum dicek). */
export const RETURN_CONDITION_LABEL: Record<ReturnCondition, string> = {
  GOOD: "Baik",
  DAMAGED: "Rusak",
  INCOMPLETE: "Tidak lengkap",
};

export const RETURN_CONDITION_VARIANT: Record<ReturnCondition, StatusVariant> = {
  GOOD: "success",
  DAMAGED: "danger",
  INCOMPLETE: "warning",
};

// ---------------------------------------------------------------------
// Tindak lanjut (2026-11-20): pengecekan menemukan unit Rusak / Tidak lengkap → peminjaman "Perlu Tindak Lanjut" (bukan
// Selesai). Revisi 2026-11-20: tindak lanjut diselesaikan DULU, baru hasilnya diverifikasi engineer; semua unit
// tertahan sampai verifikasi disetujui. PIC & Operational diberi tahu (email + lonceng), diulang tiap 7 hari.
// ---------------------------------------------------------------------

/** Pengingat tindak lanjut diulang tiap 7 hari. */
export const FOLLOW_UP_REPEAT_DAYS = 7;

export function isProblemCondition(condition: ReturnCondition | null | undefined): boolean {
  return condition === "DAMAGED" || condition === "INCOMPLETE";
}

/** Kondisi akhir unit: hasil tindak lanjut bila ada, selain itu kondisi saat dicek. */
export function finalCondition(item: { returnCondition: ReturnCondition | null; resolvedCondition: ReturnCondition | null }): ReturnCondition | null {
  return item.resolvedCondition ?? item.returnCondition;
}

/** Minggu ke berapa sejak barang tiba (0 = minggu pertama) — tahap lonceng tindak lanjut muncul lagi tiap minggu. */
export function followUpWeek(returnedIso: string, todayIso: string): number {
  return Math.max(0, Math.floor(daysBetween(returnedIso, todayIso) / FOLLOW_UP_REPEAT_DAYS));
}

/** Hasil tindak lanjut per unit bermasalah. */
export const FOLLOW_UP_RESULT_LABEL = {
  RESOLVED: "Sudah lengkap / sudah diperbaiki",
  UNRESOLVED: "Tetap rusak / tidak lengkap",
} as const;
export type FollowUpResult = keyof typeof FOLLOW_UP_RESULT_LABEL;

/**
 * Satu baris hasil pengecekan unit untuk ringkasan approval verifikasi (halaman Approval & email): kondisi + catatan,
 * hasil tindak lanjut (sejak revisi 2026-11-20 diverifikasi setelah tindak lanjut selesai), tempat ditaruh.
 */
export function returnCheckLine(item: {
  deviceName: string;
  serialNo: string | null;
  returnCondition: ReturnCondition | null;
  returnNote: string | null;
  resolvedCondition: ReturnCondition | null;
  returnRack: { name: string } | null;
  returnRackPosition: string | null;
}): string {
  const condition = item.returnCondition ? RETURN_CONDITION_LABEL[item.returnCondition] : "-";
  const followUp = isProblemCondition(item.returnCondition) && item.resolvedCondition
    ? ` → tindak lanjut: ${FOLLOW_UP_RESULT_LABEL[item.resolvedCondition === "GOOD" ? "RESOLVED" : "UNRESOLVED"].toLowerCase()}`
    : "";
  const rack = item.returnRack && item.returnRackPosition ? ` · ditaruh ${item.returnRack.name} ${item.returnRackPosition}` : "";
  return `${item.deviceName}${snSuffix(item.serialNo)} — ${condition}${item.returnNote ? `: ${item.returnNote}` : ""}${followUp}${rack}`;
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
export function groupLoanItems<T extends { deviceName: string; serialNo: string | null }>(items: T[]): LoanItemGroup[] {
  const groups = new Map<string, LoanItemGroup>();
  for (const item of items) {
    const group = groups.get(item.deviceName) ?? { deviceName: item.deviceName, quantity: 0, serials: [] };
    group.quantity += 1;
    if (item.serialNo) group.serials.push(item.serialNo);
    groups.set(item.deviceName, group);
  }
  return [...groups.values()];
}

/** Satu part number: jumlah unit & serial number yang ada (unit tanpa S/N ikut dihitung, tidak tertulis — 2026-11-25). */
export type LoanItemGroup = { deviceName: string; quantity: number; serials: string[] };

/** "Switch ×2 — SN A, B" untuk ringkasan teks (email); tanpa bagian SN bila tidak ada satu pun. */
export function loanItemGroupText(group: LoanItemGroup): string {
  return `${group.deviceName} ×${group.quantity}${group.serials.length ? ` — SN ${group.serials.join(", ")}` : ""}`;
}

/** " · SN X", atau "" bila unit tanpa serial number (boleh kosong sejak 2026-11-25). */
export function snSuffix(serial: string | null | undefined): string {
  return serial ? ` · SN ${serial}` : "";
}
