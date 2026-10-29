-- Hapus fitur yang tidak dipakai (2026-10-29): Revenue project (sejak 2026-10-05), permintaan perubahan data profil
-- (sejak 2026-10-16), dan sisa upload invoice klaim kesehatan / kwitansi reimburse (sejak 2026-10-02).
-- Alur & pengajuan approval modul REVENUE / PROFILE_CHANGE dihapus dulu (step, approver, koreksi ikut terhapus
-- lewat cascade) supaya enum ApprovalModule bisa dibuat ulang tanpa kedua nilai itu.
DELETE FROM "ApprovalRequest" WHERE "module"::text IN ('REVENUE', 'PROFILE_CHANGE');
DELETE FROM "ApprovalFlow" WHERE "module"::text IN ('REVENUE', 'PROFILE_CHANGE');

-- AlterEnum
BEGIN;
CREATE TYPE "ApprovalModule_new" AS ENUM ('REIMBURSE', 'LEAVE', 'HEALTH', 'EXPENSE', 'CERTIFICATE', 'ATTENDANCE_APPEAL');
ALTER TABLE "ApprovalFlow" ALTER COLUMN "module" TYPE "ApprovalModule_new" USING ("module"::text::"ApprovalModule_new");
ALTER TABLE "ApprovalRequest" ALTER COLUMN "module" TYPE "ApprovalModule_new" USING ("module"::text::"ApprovalModule_new");
ALTER TYPE "ApprovalModule" RENAME TO "ApprovalModule_old";
ALTER TYPE "ApprovalModule_new" RENAME TO "ApprovalModule";
DROP TYPE "public"."ApprovalModule_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "ProfileChangeRequest" DROP CONSTRAINT "ProfileChangeRequest_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectRevenue" DROP CONSTRAINT "ProjectRevenue_projectId_fkey";

-- AlterTable
ALTER TABLE "HealthClaim" DROP COLUMN "invoiceFileKey",
DROP COLUMN "invoiceFileName";

-- AlterTable
ALTER TABLE "ReimbursementItem" DROP COLUMN "receiptFileKey",
DROP COLUMN "receiptFileName";

-- DropTable
DROP TABLE "ProfileChangeRequest";

-- DropTable
DROP TABLE "ProjectRevenue";

-- DropEnum
DROP TYPE "ProfileChangeKind";
