-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('CERTIFICATE', 'ASSET_SUPPORT', 'ASSET_WARRANTY');

-- CreateTable
CREATE TABLE "ReminderLog" (
    "id" TEXT NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "entityId" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReminderLog_kind_entityId_dueDate_key" ON "ReminderLog"("kind", "entityId", "dueDate");
