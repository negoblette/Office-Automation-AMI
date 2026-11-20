-- 2026-11-20: pengembalian barang pinjaman ke principal / distributor (per unit, satu pengembalian = satu HAF).
-- Unit yang dikembalikan keluar dari inventaris (Asset.returnedToOwnerAt + deletedAt); GoodsReturnItem menyalin nama &
-- serial supaya riwayat utuh walau unit yang sama kelak diterima lagi.

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "returnedToOwnerAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "GoodsReturn" (
    "id" TEXT NOT NULL,
    "hafNumber" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "returnedDate" DATE NOT NULL,
    "contactName" TEXT NOT NULL,
    "returnedById" TEXT NOT NULL,
    "receivedByName" TEXT,
    "note" TEXT,
    "preparedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoodsReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReturnItem" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "serialNo" TEXT NOT NULL,

    CONSTRAINT "GoodsReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReturn_hafNumber_key" ON "GoodsReturn"("hafNumber");

-- CreateIndex
CREATE INDEX "GoodsReturn_receiptId_idx" ON "GoodsReturn"("receiptId");

-- CreateIndex
CREATE INDEX "GoodsReturnItem_assetId_idx" ON "GoodsReturnItem"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReturnItem_returnId_assetId_key" ON "GoodsReturnItem"("returnId", "assetId");

-- AddForeignKey
ALTER TABLE "GoodsReturn" ADD CONSTRAINT "GoodsReturn_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "GoodsReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReturn" ADD CONSTRAINT "GoodsReturn_returnedById_fkey" FOREIGN KEY ("returnedById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReturn" ADD CONSTRAINT "GoodsReturn_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReturnItem" ADD CONSTRAINT "GoodsReturnItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "GoodsReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReturnItem" ADD CONSTRAINT "GoodsReturnItem_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
