-- 2026-11-20: tindak lanjut peminjaman unit. Pengecekan Unit yang menemukan unit Rusak / Tidak lengkap tidak langsung
-- Selesai, tetapi berstatus FOLLOW_UP sampai Operational menyelesaikannya (catatan wajib, hasil per unit). Hanya enum,
-- kolom, dan relasi baru (boleh kosong); data lama dipindahkan di migrasi berikutnya (nilai enum baru belum boleh
-- dipakai di transaksi yang sama).

-- AlterEnum
ALTER TYPE "DemoLoanStatus" ADD VALUE 'FOLLOW_UP';

-- AlterTable
ALTER TABLE "DemoLoan" ADD COLUMN     "followUpNote" TEXT,
ADD COLUMN     "followUpRemindedAt" TIMESTAMP(3),
ADD COLUMN     "followUpResolvedAt" TIMESTAMP(3),
ADD COLUMN     "followUpResolvedById" TEXT;

-- AlterTable
ALTER TABLE "DemoLoanItem" ADD COLUMN     "resolvedCondition" "ReturnCondition";

-- AddForeignKey
ALTER TABLE "DemoLoan" ADD CONSTRAINT "DemoLoan_followUpResolvedById_fkey" FOREIGN KEY ("followUpResolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
