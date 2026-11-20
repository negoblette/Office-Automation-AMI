-- 2026-11-19: peminjaman unit — PIC, pemilik unit di nomor form, dan pengambilan sebelum barang kembali.
-- 1. "Sales Person" menjadi PIC (Engineer / Sales); kontak di perusahaan peminjam ("up:") berganti nama dari PIC menjadi
--    kontak. Hanya GANTI NAMA kolom: isi data lama tetap (Sales Person lama otomatis menjadi PIC).
-- 2. Pemilik unit (AMI / nama principal / distributor) disimpan per peminjaman untuk segmen ketiga nomor PTF & HAF.
--    Peminjaman lama diisi dari unitnya (nomor yang sudah terbit TIDAK diubah).
-- 3. Status baru PICKUP: Operational menjadwalkan pengambilan → nomor HAF terbit & HAF dibawa kurir AMI; setelah barang
--    tiba, Operational mengisi Pengecekan Unit → RETURNED. Kolom baru boleh kosong.

-- AlterEnum (nilai baru tidak dipakai di migrasi ini)
ALTER TYPE "DemoLoanStatus" ADD VALUE 'PICKUP';

-- RenameColumn (data tetap)
ALTER TABLE "DemoLoan" RENAME COLUMN "salesPersonId" TO "picId";
ALTER TABLE "DemoLoan" RENAME CONSTRAINT "DemoLoan_salesPersonId_fkey" TO "DemoLoan_picId_fkey";
ALTER TABLE "DemoLoan" RENAME COLUMN "picName" TO "contactName";
ALTER TABLE "DemoLoan" RENAME COLUMN "picEmail" TO "contactEmail";

-- AlterTable
ALTER TABLE "DemoLoan" ADD COLUMN     "unitOwner" TEXT NOT NULL DEFAULT 'AMI',
ADD COLUMN     "pickupDate" DATE,
ADD COLUMN     "courierId" TEXT,
ADD COLUMN     "hafPreparedById" TEXT;

-- Pemilik unit peminjaman lama: nama principal / distributor dari unit pertama yang bukan milik AMI, selain itu AMI.
UPDATE "DemoLoan" AS d
SET "unitOwner" = COALESCE(
  (
    SELECT btrim(regexp_replace(replace(a."ownerName", '/', '-'), '\s+', ' ', 'g'))
    FROM "DemoLoanItem" AS i
    JOIN "Asset" AS a ON a."id" = i."assetId"
    WHERE i."loanId" = d."id" AND a."ownership" <> 'AMI' AND a."ownerName" IS NOT NULL AND btrim(a."ownerName") <> ''
    ORDER BY i."id"
    LIMIT 1
  ),
  'AMI'
);

ALTER TABLE "DemoLoan" ALTER COLUMN "unitOwner" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "DemoLoan" ADD CONSTRAINT "DemoLoan_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoLoan" ADD CONSTRAINT "DemoLoan_hafPreparedById_fkey" FOREIGN KEY ("hafPreparedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
