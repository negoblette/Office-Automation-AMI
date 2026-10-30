-- Approval overtime (2026-10-30): sesi yang di-finalize diajukan ke approver (nomor OVT/…) sebelum bisa di-reimburse.
ALTER TABLE "Overtime" ADD COLUMN "number" TEXT;
ALTER TABLE "Overtime" ADD COLUMN "status" "RequestStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "Overtime" ADD COLUMN "approvedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Overtime_number_key" ON "Overtime"("number");

-- Sesi yang sudah selesai sebelum ada approval dianggap sudah disetujui.
UPDATE "Overtime" SET "status" = 'APPROVED', "approvedAt" = "clockOut" WHERE "clockOut" IS NOT NULL;

-- Tarif overtime per jam dihapus: nominal reimburse overtime diisi approver (Ci Ika).
DELETE FROM "AppSetting" WHERE "key" = 'overtime.hourlyRate';
