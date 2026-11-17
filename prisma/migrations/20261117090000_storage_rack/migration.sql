-- Rak penyimpanan unit Inventory & lokasi unit (2026-11-17): rak + posisi "A1" (huruf kolom + nomor baris).
-- Satu posisi boleh berisi beberapa unit, jadi tidak ada indeks unik pada posisi.
CREATE TABLE "StorageRack" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "columns" INTEGER NOT NULL,
    "rows" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StorageRack_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StorageRack_name_key" ON "StorageRack"("name");

ALTER TABLE "Asset" ADD COLUMN "rackId" TEXT,
ADD COLUMN "rackPosition" TEXT;

CREATE INDEX "Asset_rackId_rackPosition_idx" ON "Asset"("rackId", "rackPosition");

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_rackId_fkey" FOREIGN KEY ("rackId") REFERENCES "StorageRack"("id") ON DELETE SET NULL ON UPDATE CASCADE;
