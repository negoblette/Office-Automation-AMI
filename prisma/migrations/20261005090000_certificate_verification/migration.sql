-- AlterEnum
ALTER TYPE "ApprovalModule" ADD VALUE 'CERTIFICATE';

-- AlterTable
ALTER TABLE "Certificate" ADD COLUMN     "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "verificationNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_verificationNumber_key" ON "Certificate"("verificationNumber");

-- Sertifikat yang sudah ada sebelum alur verifikasi dianggap terverifikasi.
UPDATE "Certificate" SET "status" = 'APPROVED';
