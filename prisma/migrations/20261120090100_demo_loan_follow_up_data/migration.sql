-- 2026-11-20 (keputusan user): peminjaman lama yang sudah "Selesai" padahal ada unit kembali Rusak / Tidak lengkap
-- dipindahkan ke "Perlu Tindak Lanjut". followUpRemindedAt dibiarkan kosong → job pengingat harian (07:00 WIB) mengirim
-- email tindak lanjut pertamanya ke PIC & Operational. Data lain tidak berubah.
UPDATE "DemoLoan" AS d
SET "status" = 'FOLLOW_UP'
WHERE d."status" = 'RETURNED'
  AND EXISTS (
    SELECT 1 FROM "DemoLoanItem" AS i
    WHERE i."loanId" = d."id" AND i."returnCondition" IN ('DAMAGED', 'INCOMPLETE') AND i."resolvedCondition" IS NULL
  );
