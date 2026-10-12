-- AlterEnum
ALTER TYPE "ReminderKind" ADD VALUE 'DOCUMENT';

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "validUntil" DATE;
