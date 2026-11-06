-- Baris klaim kesehatan (2026-11-06): satu klaim bisa berisi beberapa baris (kategori, tanggal, nominal, keterangan).
CREATE TABLE "HealthClaimItem" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" BIGINT NOT NULL,
    "note" TEXT,

    CONSTRAINT "HealthClaimItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HealthClaimItem_claimId_idx" ON "HealthClaimItem"("claimId");

ALTER TABLE "HealthClaimItem" ADD CONSTRAINT "HealthClaimItem_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "HealthClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthClaimItem" ADD CONSTRAINT "HealthClaimItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "HealthCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Klaim lama menjadi satu baris; catatannya tetap di klaim.
INSERT INTO "HealthClaimItem" ("id", "claimId", "categoryId", "date", "amount")
SELECT 'hci_' || "id", "id", "categoryId", "claimDate", "amount" FROM "HealthClaim";
