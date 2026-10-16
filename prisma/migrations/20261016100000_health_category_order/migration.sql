-- Urutan kategori kesehatan di dropdown (2026-10-16): Rawat Jalan Dokter, Obat-obatan, Vitamin, Kacamata.
ALTER TABLE "HealthCategory" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 100;

UPDATE "HealthCategory" SET "sortOrder" = 10 WHERE "name" = 'Rawat Jalan Dokter';
UPDATE "HealthCategory" SET "sortOrder" = 20 WHERE "name" = 'Obat-obatan';
UPDATE "HealthCategory" SET "sortOrder" = 30 WHERE "name" = 'Vitamin';
UPDATE "HealthCategory" SET "sortOrder" = 40 WHERE "name" = 'Kacamata';
