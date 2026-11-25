-- 2026-11-25 (permintaan user): serial number unit tidak wajib saat Daftarkan Unit, Terima Barang & Ubah Unit.
-- Bila diisi tetap UPPERCASE & unik (indeks unik Asset_serialNo_key tetap; NULL tidak bentrok satu sama lain di
-- PostgreSQL). Salinan di peminjaman & pengembalian ikut boleh kosong. Data lama tidak berubah.

-- AlterTable
ALTER TABLE "Asset" ALTER COLUMN "serialNo" DROP NOT NULL;

-- AlterTable
ALTER TABLE "DemoLoanItem" ALTER COLUMN "serialNo" DROP NOT NULL;

-- AlterTable
ALTER TABLE "GoodsReturnItem" ALTER COLUMN "serialNo" DROP NOT NULL;
