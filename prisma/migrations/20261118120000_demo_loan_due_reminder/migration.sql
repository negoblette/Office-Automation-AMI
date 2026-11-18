-- Fase 16.4 (2026-11-18): peringatan jatuh tempo peminjaman unit & perpanjangan.
-- - DemoLoanReminder: jejak email pengingat yang sudah dibuat (satu per peminjaman per jatuh tempo per tahap), supaya
--   pengingat tidak terkirim dua kali dan tidak hilang bila worker sempat mati.
-- - DemoLoanExtension: pengajuan perpanjangan jatuh tempo, disetujui lewat approval engine (modul baru
--   DEMO_LOAN_EXTENSION yang memakai Approval Flow DEMO_LOAN).
-- Hanya tabel & nilai enum baru; data lama tidak berubah.

-- AlterEnum
ALTER TYPE "ApprovalModule" ADD VALUE 'DEMO_LOAN_EXTENSION';

-- CreateEnum
CREATE TYPE "DemoLoanExtensionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "DemoLoanExtension" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "previousDueDate" DATE NOT NULL,
    "newDueDate" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "DemoLoanExtensionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "DemoLoanExtension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoLoanReminder" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "stage" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoLoanReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DemoLoanExtension_loanId_status_idx" ON "DemoLoanExtension"("loanId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DemoLoanReminder_loanId_dueDate_stage_key" ON "DemoLoanReminder"("loanId", "dueDate", "stage");

-- AddForeignKey
ALTER TABLE "DemoLoanExtension" ADD CONSTRAINT "DemoLoanExtension_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "DemoLoan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoLoanExtension" ADD CONSTRAINT "DemoLoanExtension_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoLoanReminder" ADD CONSTRAINT "DemoLoanReminder_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "DemoLoan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
