-- Hardening Tahap 4 — enkripsi kolom data pribadi (docs/08-INVENTARIS-DATA.md, lib/services/personal-data.ts).
-- Alasan perubahan skema:
--  1. Kolom pribadi menyimpan ciphertext AES-256-GCM ("v1:<iv>:<data>:<tag>"), yang tidak muat di VARCHAR(16)
--     maupun DATE → semua menjadi TEXT. Tanggal lahir disimpan sebagai teks YYYY-MM-DD sebelum dienkripsi.
--  2. Ciphertext berbeda setiap kali disimpan (IV acak), jadi index unik pada "nik" tidak lagi menjaga keunikan NIK.
--     Keunikan pindah ke "nikHash" = sidik jari NIK (HMAC-SHA256, DATA_INDEX_KEY); pesan "NIK sudah terdaftar" tetap.
-- Nilai lama tetap terbaca oleh aplikasi; `npm run data:encrypt` mengenkripsinya dan mengisi "nikHash".

-- DropIndex
DROP INDEX "Employee_nik_key";

-- AlterTable
ALTER TABLE "Candidate" ALTER COLUMN "nik" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "nikHash" TEXT,
ALTER COLUMN "nik" SET DATA TYPE TEXT,
ALTER COLUMN "kkNo" SET DATA TYPE TEXT,
ALTER COLUMN "birthDate" SET DATA TYPE TEXT USING to_char("birthDate", 'YYYY-MM-DD'),
ALTER COLUMN "npwp" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "FamilyMember" ALTER COLUMN "nik" SET DATA TYPE TEXT,
ALTER COLUMN "birthDate" SET DATA TYPE TEXT USING to_char("birthDate", 'YYYY-MM-DD');

-- CreateIndex
CREATE UNIQUE INDEX "Employee_nikHash_key" ON "Employee"("nikHash");
