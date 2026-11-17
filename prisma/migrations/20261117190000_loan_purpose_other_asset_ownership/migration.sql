-- 2026-11-17 (permintaan user): kegunaan peminjaman "Lainnya" + detailnya, dan kepemilikan unit (milik AMI / titipan
-- principal / distributor). Unit yang sudah ada otomatis "Milik AMI". Hanya menambah, tidak mengubah data lama.

-- CreateEnum
CREATE TYPE "AssetOwnership" AS ENUM ('AMI', 'PRINCIPAL', 'DISTRIBUTOR');

-- AlterEnum
ALTER TYPE "LoanPurpose" ADD VALUE 'OTHER';

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "ownerName" TEXT,
ADD COLUMN     "ownership" "AssetOwnership" NOT NULL DEFAULT 'AMI';

-- AlterTable
ALTER TABLE "DemoLoan" ADD COLUMN     "purposeDetail" TEXT;
