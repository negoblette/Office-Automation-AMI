-- 2026-11-18: Kalender Libur mengambil libur nasional dari kalender publik Google "Hari Libur di Indonesia" (cek harian).
-- - Holiday.source: MANUAL (diisi Admin, tidak pernah diubah sinkronisasi) / SYNC (boleh dikoreksi sinkronisasi).
--   Semua libur yang sudah ada = MANUAL (aman: tidak ada yang berubah oleh sinkronisasi).
-- - Holiday.removedBySync: dihapus sinkronisasi (boleh dipulihkan bila muncul lagi di sumber).
-- - HolidayPendingChange: perubahan yang menunggu konfirmasi (≥ 20 jam). HolidayChange: riwayat yang diterapkan
--   (notifikasi HR & Direktur + pengajuan cuti terdampak).

-- CreateEnum
CREATE TYPE "HolidaySource" AS ENUM ('MANUAL', 'SYNC');

-- CreateEnum
CREATE TYPE "HolidayChangeKind" AS ENUM ('ADD', 'REMOVE', 'RENAME');

-- AlterTable
ALTER TABLE "Holiday" ADD COLUMN     "removedBySync" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source" "HolidaySource" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "HolidayPendingChange" (
    "id" TEXT NOT NULL,
    "kind" "HolidayChangeKind" NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "previousName" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HolidayPendingChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HolidayChange" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "kind" "HolidayChangeKind" NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "previousName" TEXT,
    "affectedLeaveIds" TEXT[],
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HolidayChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HolidayPendingChange_kind_date_key" ON "HolidayPendingChange"("kind", "date");

-- CreateIndex
CREATE INDEX "HolidayChange_appliedAt_idx" ON "HolidayChange"("appliedAt");

-- CreateIndex
CREATE INDEX "HolidayChange_runId_idx" ON "HolidayChange"("runId");
