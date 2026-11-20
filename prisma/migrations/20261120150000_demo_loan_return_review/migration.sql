-- 2026-11-20: hasil Pengecekan Unit diverifikasi engineer lewat approval (modul DEMO_LOAN_RETURN, default Ko Yosep)
-- sebelum peminjaman Selesai / Tindak lanjut. Hanya nilai enum baru; Approval Flow-nya dibuat di migrasi berikutnya
-- (nilai enum baru belum boleh dipakai di transaksi yang sama).

-- AlterEnum
ALTER TYPE "ApprovalModule" ADD VALUE 'DEMO_LOAN_RETURN';

-- AlterEnum
ALTER TYPE "DemoLoanStatus" ADD VALUE 'RETURN_REVIEW';
