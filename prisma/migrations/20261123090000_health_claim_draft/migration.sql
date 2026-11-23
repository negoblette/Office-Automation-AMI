-- Draft klaim kesehatan (2026-11-23, permintaan user: persis seperti draft reimburse).
-- - Draft belum lengkap menyimpan isian form apa adanya di "draftForm" tanpa baris; kategori & tanggal klaim di tabel
--   induk baru terisi saat draft lengkap, jadi keduanya boleh kosong (klaim yang diajukan tetap selalu terisi).
-- - Hapus draft = soft delete ("deletedAt"), sama dengan Reimbursement.
-- Data klaim lama tidak berubah. Foreign key kategori tetap ON DELETE RESTRICT.
ALTER TABLE "HealthClaim" ALTER COLUMN "categoryId" DROP NOT NULL;
ALTER TABLE "HealthClaim" ALTER COLUMN "claimDate" DROP NOT NULL;
ALTER TABLE "HealthClaim" ADD COLUMN "draftForm" JSONB;
ALTER TABLE "HealthClaim" ADD COLUMN "deletedAt" TIMESTAMP(3);
