-- CreateEnum
CREATE TYPE "AppealReason" AS ENUM ('SICK', 'VISIT');

-- AlterEnum
ALTER TYPE "ApprovalModule" ADD VALUE 'ATTENDANCE_APPEAL';

-- CreateTable
CREATE TABLE "AttendanceAppeal" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" "AppealReason" NOT NULL,
    "note" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceAppeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceAppeal_number_key" ON "AttendanceAppeal"("number");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceAppeal_employeeId_date_key" ON "AttendanceAppeal"("employeeId", "date");

-- AddForeignKey
ALTER TABLE "AttendanceAppeal" ADD CONSTRAINT "AttendanceAppeal_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
