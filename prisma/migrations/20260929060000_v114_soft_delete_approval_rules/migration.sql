-- AlterTable
ALTER TABLE "ApprovalFlow" ADD COLUMN     "autoApproveWhenSkipped" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Certificate" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Employee" DROP COLUMN "skipApproval";

-- AlterTable
ALTER TABLE "FamilyMember" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "HealthClaim" ADD COLUMN     "approvedAmount" BIGINT;

-- AlterTable
ALTER TABLE "Holiday" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Reimbursement" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- Klaim yang sudah disetujui sebelum v1.14: nominal disetujui = nominal diajukan.
UPDATE "HealthClaim" SET "approvedAmount" = "amount" WHERE "status" = 'APPROVED';
