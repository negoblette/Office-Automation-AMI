-- Fase 16.3 (2026-11-17): cetak Product Trial Form & pengantaran. Operational yang menyiapkan (nama di kolom
-- "Operational"), tanggal diantar & nama penerima ("Received By"). Hanya kolom baru (boleh kosong).

-- AlterTable
ALTER TABLE "DemoLoan" ADD COLUMN     "deliveredAt" DATE,
ADD COLUMN     "operationalId" TEXT,
ADD COLUMN     "receivedByName" TEXT;

-- AddForeignKey
ALTER TABLE "DemoLoan" ADD CONSTRAINT "DemoLoan_operationalId_fkey" FOREIGN KEY ("operationalId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
