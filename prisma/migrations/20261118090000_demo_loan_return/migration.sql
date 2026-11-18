-- Fase 16.5 (2026-11-18): pengembalian unit pinjaman. Operational mengecek kondisi tiap unit & menaruhnya kembali di rak,
-- lalu Hardware Admission Form (HAF) terbit. Hanya kolom & enum baru (boleh kosong); data lama tidak berubah.

-- CreateEnum
CREATE TYPE "ReturnCondition" AS ENUM ('GOOD', 'DAMAGED', 'INCOMPLETE');

-- AlterTable
ALTER TABLE "DemoLoan" ADD COLUMN     "hafNumber" TEXT,
ADD COLUMN     "receivedById" TEXT,
ADD COLUMN     "returnNote" TEXT,
ADD COLUMN     "returnedAt" DATE,
ADD COLUMN     "returnedByName" TEXT;

-- AlterTable
ALTER TABLE "DemoLoanItem" ADD COLUMN     "returnCondition" "ReturnCondition",
ADD COLUMN     "returnNote" TEXT,
ADD COLUMN     "returnRackId" TEXT,
ADD COLUMN     "returnRackPosition" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "DemoLoan_hafNumber_key" ON "DemoLoan"("hafNumber");

-- AddForeignKey
ALTER TABLE "DemoLoan" ADD CONSTRAINT "DemoLoan_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoLoanItem" ADD CONSTRAINT "DemoLoanItem_returnRackId_fkey" FOREIGN KEY ("returnRackId") REFERENCES "StorageRack"("id") ON DELETE SET NULL ON UPDATE CASCADE;
