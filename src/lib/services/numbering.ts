// Penomoran dokumen `PREFIX/YYYY/MM/NNNN` — Tech Spec §3.
// Counter per (prefix, tahun, bulan) dinaikkan dengan SATU statement atomik sehingga
// tidak ada nomor ganda walau banyak submit bersamaan. Panggil di dalam transaksi submit.
import type { Prisma } from "@/generated/prisma/client";
import { toJakartaIsoDate } from "@/lib/format";

export const DOCUMENT_PREFIX = {
  REIMBURSE: "RMB",
  LEAVE: "LV",
  HEALTH: "HC",
  EXPENSE: "EXP",
  REVENUE: "REV",
  CERTIFICATE: "CRT",
  ATTENDANCE_APPEAL: "APL",
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
