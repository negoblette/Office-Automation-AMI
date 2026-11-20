-- 2026-11-20: penerimaan barang principal / distributor. Unit bukan milik AMI wajib didaftarkan lewat penerimaan
-- (Operational) yang menerbitkan Hardware Admission Form — satu kedatangan = satu HAF, boleh banyak unit. Hanya tabel &
-- kolom baru (boleh kosong); unit titipan lama dibiarkan tanpa penerimaan (keputusan user).

-- CreateTable
CREATE TABLE "GoodsReceipt" (
    "id" TEXT NOT NULL,
    "hafNumber" TEXT NOT NULL,
    "ownership" "AssetOwnership" NOT NULL,
    "ownerName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "receivedDate" DATE NOT NULL,
    "picId" TEXT NOT NULL,
    "senderName" TEXT,
    "receiverId" TEXT NOT NULL,
    "purpose" TEXT,
    "preparedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "receiptId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReceipt_hafNumber_key" ON "GoodsReceipt"("hafNumber");

-- CreateIndex
CREATE INDEX "GoodsReceipt_receivedDate_idx" ON "GoodsReceipt"("receivedDate");

-- CreateIndex
CREATE INDEX "Asset_receiptId_idx" ON "Asset"("receiptId");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "GoodsReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_picId_fkey" FOREIGN KEY ("picId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
