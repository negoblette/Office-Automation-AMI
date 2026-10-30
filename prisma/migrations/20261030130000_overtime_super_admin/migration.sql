-- Super admin (2026-10-30): akun admin.oa@arthamitra.co.id bisa menyetujui semua pengajuan, membuka modul yang
-- ditunda, dan tidak bisa diubah/dinonaktifkan Admin lain.
ALTER TABLE "User" ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;
UPDATE "User" SET "isSuperAdmin" = true WHERE "email" = 'admin.oa@arthamitra.co.id';

-- Overtime engineer (2026-10-30): beberapa sesi per hari, clock out = finalize customer + project.
CREATE TABLE "Overtime" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "clockIn" TIMESTAMP(3) NOT NULL,
    "clockOut" TIMESTAMP(3),
    "customerId" TEXT,
    "projectId" TEXT,
    "activity" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Overtime_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Overtime_employeeId_date_idx" ON "Overtime"("employeeId", "date");
-- Hanya satu sesi overtime berjalan per karyawan (dua klik Clock In bersamaan tidak membuat dua sesi).
CREATE UNIQUE INDEX "Overtime_open_key" ON "Overtime"("employeeId") WHERE "clockOut" IS NULL;

ALTER TABLE "Overtime" ADD CONSTRAINT "Overtime_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Overtime" ADD CONSTRAINT "Overtime_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Overtime" ADD CONSTRAINT "Overtime_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Baris reimburse dari overtime: satu overtime hanya bisa di-reimburse sekali.
ALTER TABLE "ReimbursementItem" ADD COLUMN "overtimeId" TEXT;
CREATE UNIQUE INDEX "ReimbursementItem_overtimeId_key" ON "ReimbursementItem"("overtimeId");
ALTER TABLE "ReimbursementItem" ADD CONSTRAINT "ReimbursementItem_overtimeId_fkey" FOREIGN KEY ("overtimeId") REFERENCES "Overtime"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Tipe reimburse khusus overtime: divisions kosong → tidak muncul di dropdown baris biasa, hanya lewat pilihan overtime.
INSERT INTO "ReimburseType" ("id", "code", "name", "divisions", "isActive")
VALUES ('reimburse_type_overtime', 'OVERTIME', 'Overtime', ARRAY[]::TEXT[], true)
ON CONFLICT ("code") DO NOTHING;
