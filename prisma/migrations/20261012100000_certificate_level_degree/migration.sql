-- CreateEnum
CREATE TYPE "EducationLevel" AS ENUM ('SMA_SMK', 'D1', 'D2', 'D3', 'D4', 'S1', 'S2', 'S3');

-- AlterTable
ALTER TABLE "Certificate" ADD COLUMN     "degree" "EducationLevel",
ADD COLUMN     "graduationDate" DATE,
ADD COLUMN     "level" INTEGER;

-- Data lama: ijazah memakai startDate sebagai "tanggal lulus" dan tidak punya masa berlaku.
UPDATE "Certificate" SET "graduationDate" = "startDate", "endDate" = NULL WHERE "type" = 'IJAZAH';
