-- Potong saldo sebagian (2026-10-30): cuti melahirkan gratis 2 hari kerja (laki-laki) / 90 hari kerja (perempuan),
-- lebihnya memotong saldo. Penanda ya/tidak diganti jumlah hari yang dipotong.
ALTER TABLE "LeaveRequest" ADD COLUMN "deductDays" INTEGER NOT NULL DEFAULT 0;
UPDATE "LeaveRequest" SET "deductDays" = CASE WHEN "deductBalance" THEN "workingDays" ELSE 0 END;
ALTER TABLE "LeaveRequest" ALTER COLUMN "deductDays" DROP DEFAULT;
ALTER TABLE "LeaveRequest" DROP COLUMN "deductBalance";
