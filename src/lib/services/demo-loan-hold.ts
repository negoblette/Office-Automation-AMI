// Unit yang sedang TERTAHAN peminjaman (tidak bisa diajukan pinjam lagi; tampil di Daftar Unit sebagai status
// peminjamannya). Dipakai service pengajuan (dikunci), pilihan form, dan Daftar Unit supaya aturannya satu.
// - Peminjaman Menunggu approval / Disiapkan / Dipinjam / Pengambilan / Menunggu verifikasi: semua unitnya.
// - Peminjaman Perlu Tindak Lanjut: juga SEMUA unitnya (revisi 2026-11-20). Tindak lanjut kini terjadi SEBELUM verifikasi
//   engineer, dan verifikasi yang ditolak berarti semua unit dicek ulang — jadi unit yang kembali Baik pun belum bebas
//   sampai verifikasi disetujui (sebelumnya unit Baik langsung bebas karena sudah diverifikasi).
import type { Prisma } from "@/generated/prisma/client";
import { ACTIVE_LOAN_STATUSES } from "@/lib/demo-loan";

/** Filter `DemoLoanItem` yang menahan unitnya. `exceptLoanId` = peminjaman yang sedang direvisi (unitnya sendiri bebas). */
export function heldLoanItemWhere(exceptLoanId?: string): Prisma.DemoLoanItemWhereInput {
  const except = exceptLoanId ? { id: { not: exceptLoanId } } : {};
  return { loan: { status: { in: [...ACTIVE_LOAN_STATUSES, "FOLLOW_UP"] }, ...except } };
}
