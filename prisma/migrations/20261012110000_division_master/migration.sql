-- 2026-10-12: divisi jadi master data (bisa ditambah). Kolom enum → teks (kode), data tetap.
-- Enum "Division" dihapus dulu karena namanya sama dengan tabel baru.
ALTER TABLE "Employee" ALTER COLUMN "division" TYPE TEXT USING "division"::text;
ALTER TABLE "Reimbursement" ALTER COLUMN "division" TYPE TEXT USING "division"::text;
ALTER TABLE "ApprovalFlow" ALTER COLUMN "division" TYPE TEXT USING "division"::text;
ALTER TABLE "ReimburseType" ALTER COLUMN "divisions" TYPE TEXT[] USING "divisions"::text[];
DROP TYPE "Division";

CREATE TABLE "Division" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "followsCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Division_pkey" PRIMARY KEY ("code")
);
CREATE UNIQUE INDEX "Division_name_key" ON "Division"("name");

INSERT INTO "Division" ("code", "name", "followsCode", "sortOrder") VALUES
  ('UMUM', 'Umum', NULL, 1),
  ('ENGINEER', 'Engineer', NULL, 2),
  ('SALES', 'Sales', NULL, 3),
  ('DIRECTOR', 'Direktur', NULL, 4),
  ('HR', 'HR', 'UMUM', 5),
  ('FINANCE', 'Finance', 'UMUM', 6);

-- Tipe reimburse yang boleh dipakai Umum juga boleh dipakai HR & Finance (ikut Umum).
UPDATE "ReimburseType" SET "divisions" = array_cat("divisions", ARRAY['HR', 'FINANCE']) WHERE 'UMUM' = ANY("divisions");
