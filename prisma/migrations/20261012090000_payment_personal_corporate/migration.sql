-- 2026-10-12: payment Cash/Kartu Kredit → Personal/Corporate. Rename (data lama ikut: CASH → PERSONAL, CC → CORPORATE).
ALTER TYPE "PaymentMethod" RENAME VALUE 'CASH' TO 'PERSONAL';
ALTER TYPE "PaymentMethod" RENAME VALUE 'CC' TO 'CORPORATE';
ALTER TABLE "Reimbursement" RENAME COLUMN "totalCash" TO "totalPersonal";
ALTER TABLE "Reimbursement" RENAME COLUMN "totalCc" TO "totalCorporate";
