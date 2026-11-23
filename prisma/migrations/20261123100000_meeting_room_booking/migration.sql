-- Fase 17 (2026-11-23): booking ruang meeting tanpa approval (siapa cepat dia dapat).
-- Bagian akhir file ditulis manual: exclusion constraint anti-bentrok + 2 ruang awal.

-- CreateEnum
CREATE TYPE "MeetingBookingStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateTable
CREATE TABLE "MeetingRoom" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingBooking" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agenda" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "MeetingBookingStatus" NOT NULL DEFAULT 'ACTIVE',
    "editedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MeetingRoom_number_key" ON "MeetingRoom"("number");

-- CreateIndex
CREATE INDEX "MeetingBooking_startAt_idx" ON "MeetingBooking"("startAt");

-- CreateIndex
CREATE INDEX "MeetingBooking_userId_startAt_idx" ON "MeetingBooking"("userId", "startAt");

-- AddForeignKey
ALTER TABLE "MeetingBooking" ADD CONSTRAINT "MeetingBooking_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "MeetingRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingBooking" ADD CONSTRAINT "MeetingBooking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingBooking" ADD CONSTRAINT "MeetingBooking_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------------------------------
-- Manual (tidak dikenal Prisma, tidak dihapus Prisma — sama seperti trigger AuditLog).
-- ---------------------------------------------------------------------------------------------------------------------

-- Jam selesai harus setelah jam mulai.
ALTER TABLE "MeetingBooking" ADD CONSTRAINT "MeetingBooking_time_check" CHECK ("endAt" > "startAt");

-- Pengaman race condition: database menolak dua booking ACTIVE yang jamnya bertumpuk di ruang yang sama, secara atomik
-- lewat index GiST (booking = satu INSERT, tanpa "cek dulu lalu simpan"). Dua permintaan bersamaan → yang kedua menunggu
-- yang pertama commit lalu gagal dengan kode 23P01 (exclusion_violation). Rentang '[)' = jam selesai tidak ikut, jadi
-- 09:00–10:00 dan 10:00–11:00 tidak bentrok. Booking CANCELLED tidak ikut dicek.
-- btree_gist diperlukan agar kolom teks "roomId" (operator =) bisa masuk index GiST; extension "trusted" (PostgreSQL ≥ 13).
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "MeetingBooking" ADD CONSTRAINT "MeetingBooking_no_overlap"
  EXCLUDE USING gist ("roomId" WITH =, tsrange("startAt", "endAt", '[)') WITH &&)
  WHERE ("status" = 'ACTIVE');

-- Dua ruang awal: Ruang Meeting 1 sudah beroperasi, Ruang Meeting 2 dinyalakan Admin di Setting → Ruang Meeting.
INSERT INTO "MeetingRoom" ("id", "number", "name", "isActive", "updatedAt") VALUES
  ('mtg_room_1', 1, 'Ruang Meeting 1', true, CURRENT_TIMESTAMP),
  ('mtg_room_2', 2, 'Ruang Meeting 2', false, CURRENT_TIMESTAMP)
ON CONFLICT ("number") DO NOTHING;
