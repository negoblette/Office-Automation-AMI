// Unit yang sedang TERTAHAN peminjaman (tidak bisa diajukan pinjam lagi; tampil di Daftar Unit sebagai status
// peminjamannya). Dipakai service pengajuan (dikunci), pilihan form, dan Daftar Unit supaya aturannya satu.
// - Peminjaman Menunggu approval / Disiapkan / Dipinjam / Pengambilan: semua unitnya.
// - Peminjaman Perlu Tindak Lanjut (2026-11-20): hanya unit yang kembali Rusak / Tidak lengkap dan belum diselesaikan —
//   unit yang kembali Baik langsung bebas.
import type { Prisma } from "@/generated/prisma/client";
import { ACTIVE_LOAN_STATUSES, PROBLEM_CONDITIONS } from "@/lib/demo-loan";

/** Filter `DemoLoanItem` yang menahan unitnya. `exceptLoanId` = peminjaman yang sedang direvisi (unitnya sendiri bebas). */
export function heldLoanItemWhere(exceptLoanId?: string): Prisma.DemoLoanItemWhereInput {
  const except = exceptLoanId ? { id: { not: exceptLoanId } } : {};
  return {
    OR: [
      { loan: { status: { in: [...ACTIVE_LOAN_STATUSES] }, ...except } },
      { loan: { status: "FOLLOW_UP", ...except }, returnCondition: { in: [...PROBLEM_CONDITIONS] }, resolvedCondition: null },
    ],
  };
}
