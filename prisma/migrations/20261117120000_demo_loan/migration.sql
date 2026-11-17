-- Fase 16.2 (2026-11-17): peminjaman unit demo ke perusahaan lain (Product Trial Form).
-- Hanya tabel & enum baru; tidak mengubah data yang sudah ada.

-- CreateEnum
CREATE TYPE "DemoLoanStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'ON_LOAN', 'RETURNED');

-- CreateEnum
CREATE TYPE "LoanDurationUnit" AS ENUM ('DAY', 'WEEK', 'MONTH');

-- CreateTable
CREATE TABLE "DemoLoan" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "status" "DemoLoanStatus" NOT NULL DEFAULT 'PENDING',
    "requesterId" TEXT NOT NULL,
    "salesPersonId" TEXT NOT NULL,
    "customerId" TEXT,
    "borrowerName" TEXT NOT NULL,
    "picName" TEXT NOT NULL,
    "picEmail" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "durationValue" INTEGER NOT NULL,
    "durationUnit" "LoanDurationUnit" NOT NULL,
    "dueDate" DATE NOT NULL,
    "remarks" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "itemSenderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoLoanItem" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "serialNo" TEXT NOT NULL,
    "rackId" TEXT,
    "rackPosition" TEXT,

    CONSTRAINT "DemoLoanItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DemoLoan_number_key" ON "DemoLoan"("number");

-- CreateIndex
CREATE INDEX "DemoLoan_status_dueDate_idx" ON "DemoLoan"("status", "dueDate");

-- CreateIndex
CREATE INDEX "DemoLoan_requesterId_status_idx" ON "DemoLoan"("requesterId", "status");

-- CreateIndex
CREATE INDEX "DemoLoanItem_assetId_idx" ON "DemoLoanItem"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "DemoLoanItem_loanId_assetId_key" ON "DemoLoanItem"("loanId", "assetId");

-- AddForeignKey
ALTER TABLE "DemoLoan" ADD CONSTRAINT "DemoLoan_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoLoan" ADD CONSTRAINT "DemoLoan_salesPersonId_fkey" FOREIGN KEY ("salesPersonId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoLoan" ADD CONSTRAINT "DemoLoan_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoLoan" ADD CONSTRAINT "DemoLoan_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoLoan" ADD CONSTRAINT "DemoLoan_itemSenderId_fkey" FOREIGN KEY ("itemSenderId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoLoanItem" ADD CONSTRAINT "DemoLoanItem_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "DemoLoan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoLoanItem" ADD CONSTRAINT "DemoLoanItem_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoLoanItem" ADD CONSTRAINT "DemoLoanItem_rackId_fkey" FOREIGN KEY ("rackId") REFERENCES "StorageRack"("id") ON DELETE SET NULL ON UPDATE CASCADE;
