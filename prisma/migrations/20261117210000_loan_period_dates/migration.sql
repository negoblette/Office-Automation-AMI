-- 2026-11-17 (permintaan user): jangka pinjam diisi sebagai tanggal mulai & tanggal selesai; lamanya (tahun / bulan /
-- hari) dihitung dari kedua tanggal itu, jadi kolom "lama + satuan" dihapus. `dueDate` (tanggal selesai) sudah ada dan
-- tetap dipakai; data lama tidak hilang karena tanggal mulai & selesai sudah tersimpan.

-- AlterTable
ALTER TABLE "DemoLoan" DROP COLUMN "durationUnit",
DROP COLUMN "durationValue";

-- DropEnum
DROP TYPE "LoanDurationUnit";
