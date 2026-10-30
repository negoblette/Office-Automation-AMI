-- Jenis cuti (2026-10-30): Tahunan / Melahirkan / Kematian + penanda potong saldo.
-- Cuti lama = Tahunan dan memotong saldo (sama seperti sebelumnya).
CREATE TYPE "LeaveType" AS ENUM ('ANNUAL', 'MATERNITY', 'BEREAVEMENT');

ALTER TABLE "LeaveRequest"
  ADD COLUMN "type" "LeaveType" NOT NULL DEFAULT 'ANNUAL',
  ADD COLUMN "deductBalance" BOOLEAN NOT NULL DEFAULT true;
