-- Clock out otomatis di jam pulang (2026-10-30): penanda clock out yang diisi sistem.
ALTER TABLE "Attendance" ADD COLUMN "autoClockOut" BOOLEAN NOT NULL DEFAULT false;
