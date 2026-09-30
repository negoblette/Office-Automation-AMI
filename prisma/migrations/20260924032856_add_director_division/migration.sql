/*
  Warnings:

  - You are about to drop the column `division` on the `ReimburseType` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "Division" ADD VALUE 'DIRECTOR';

-- AlterTable
ALTER TABLE "ReimburseType" DROP COLUMN "division",
ADD COLUMN     "divisions" "Division"[];
