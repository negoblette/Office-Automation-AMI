// Penomoran dokumen `PREFIX/YYYY/MM/NNNN` — Tech Spec §3.
// Counter per (prefix, tahun, bulan) dinaikkan dengan SATU statement atomik sehingga
// tidak ada nomor ganda walau banyak submit bersamaan. Panggil di dalam transaksi submit.
import type { Prisma } from "@/generated/prisma/client";
import { formatTrialFormNumber } from "@/lib/demo-loan";
import { toJakartaIsoDate } from "@/lib/format";

export const DOCUMENT_PREFIX = {
  REIMBURSE: "RMB",
  LEAVE: "LV",
  HEALTH: "HC",
  EXPENSE: "EXP",
  CERTIFICATE: "CRT",
  ATTENDANCE_APPEAL: "APL",
  OVERTIME: "OVT",
} as const;

export type DocumentPrefix = (typeof DOCUMENT_PREFIX)[keyof typeof DOCUMENT_PREFIX];

/** "RMB", 2026, 9, 1 → "RMB/2026/09/0001". Di atas 9999 tetap bertambah digitnya. */
export function formatDocumentNumber(prefix: DocumentPrefix, year: number, month: number, value: number): string {
  return `${prefix}/${year}/${String(month).padStart(2, "0")}/${String(value).padStart(4, "0")}`;
}

/** Nomor berikutnya untuk prefix, berdasarkan bulan kalender Jakarta dari `at`. */
export async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  prefix: DocumentPrefix,
  at: Date = new Date(),
): Promise<string> {
  const [year, month] = toJakartaIsoDate(at).split("-").map(Number);
  const [row] = await tx.$queryRaw<{ lastValue: number }[]>`
    INSERT INTO "NumberSequence" ("prefix", "year", "month", "lastValue")
    VALUES (${prefix}, ${year}, ${month}, 1)
    ON CONFLICT ("prefix", "year", "month")
    DO UPDATE SET "lastValue" = "NumberSequence"."lastValue" + 1
    RETURNING "lastValue"`;
  return formatDocumentNumber(prefix, year, month, row.lastValue);
}

/**
 * Product Trial Form (Fase 16, 2026-11-17): `NNN/AMI-PTF/<bulan Romawi>/<tahun>`, urut ulang tiap TAHUN — counter
 * disimpan di NumberSequence dengan `month = 0`. Nomor awal bisa diatur Admin (services/demo-loan.ts).
 */
export const TRIAL_FORM_PREFIX = "PTF";

/** Nomor form berikutnya (bulan & tahun kalender Jakarta dari `at`). Panggil di dalam transaksi pengajuan. */
export async function nextTrialFormNumber(tx: Prisma.TransactionClient, at: Date = new Date()): Promise<string> {
  const [year, month] = toJakartaIsoDate(at).split("-").map(Number);
  const [row] = await tx.$queryRaw<{ lastValue: number }[]>`
    INSERT INTO "NumberSequence" ("prefix", "year", "month", "lastValue")
    VALUES (${TRIAL_FORM_PREFIX}, ${year}, 0, 1)
    ON CONFLICT ("prefix", "year", "month")
    DO UPDATE SET "lastValue" = "NumberSequence"."lastValue" + 1
    RETURNING "lastValue"`;
  return formatTrialFormNumber(row.lastValue, month, year);
}
