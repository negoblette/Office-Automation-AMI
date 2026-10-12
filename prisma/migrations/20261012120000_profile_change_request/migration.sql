-- CreateEnum
CREATE TYPE "ProfileChangeKind" AS ENUM ('SELF_DATA', 'FAMILY_ADD', 'FAMILY_UPDATE', 'FAMILY_DELETE', 'DOCUMENT_ADD', 'DOCUMENT_DELETE', 'CERTIFICATE_DELETE');

-- AlterEnum
ALTER TYPE "ApprovalModule" ADD VALUE 'PROFILE_CHANGE';

-- CreateTable
CREATE TABLE "ProfileChangeRequest" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" "ProfileChangeKind" NOT NULL,
    "targetId" TEXT,
    "payload" JSONB NOT NULL,
    "summary" TEXT[],
    "fileKey" TEXT,
    "fileName" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "ProfileChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProfileChangeRequest_number_key" ON "ProfileChangeRequest"("number");

-- CreateIndex
CREATE INDEX "ProfileChangeRequest_employeeId_status_idx" ON "ProfileChangeRequest"("employeeId", "status");

-- AddForeignKey
ALTER TABLE "ProfileChangeRequest" ADD CONSTRAINT "ProfileChangeRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
