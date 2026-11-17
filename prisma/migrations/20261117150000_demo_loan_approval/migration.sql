-- Fase 16.2 revisi (2026-11-17): peminjaman unit memakai approval engine (modul DEMO_LOAN, Ko Yosep) — keputusan &
-- alasan tolak disimpan di ApprovalRequest, jadi kolom tinjauan Operational dihapus. Tambah kegunaan (Backup Unit / POC)
-- dan waktu disetujui; nomor form terbit saat diajukan sehingga wajib terisi.
-- Tabel DemoLoan masih baru (belum ada data di lingkungan mana pun); kolom purpose tetap diberi default sementara supaya
-- migrasi aman bila ada baris uji.

-- CreateEnum
CREATE TYPE "LoanPurpose" AS ENUM ('BACKUP_UNIT', 'POC');

-- AlterEnum
ALTER TYPE "ApprovalModule" ADD VALUE 'DEMO_LOAN';

-- DropForeignKey
ALTER TABLE "DemoLoan" DROP CONSTRAINT "DemoLoan_reviewedById_fkey";

-- AlterTable
ALTER TABLE "DemoLoan" DROP COLUMN "reviewNote",
DROP COLUMN "reviewedAt",
DROP COLUMN "reviewedById",
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "purpose" "LoanPurpose" NOT NULL DEFAULT 'POC',
ALTER COLUMN "number" SET NOT NULL;

ALTER TABLE "DemoLoan" ALTER COLUMN "purpose" DROP DEFAULT;
