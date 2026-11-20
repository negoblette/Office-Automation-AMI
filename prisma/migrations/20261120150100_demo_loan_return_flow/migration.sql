-- 2026-11-20: Approval Flow "Verifikasi Pengembalian Unit" (DEMO_LOAN_RETURN) dibuat sama dengan flow "Peminjaman Unit"
-- (DEMO_LOAN) yang aktif sekarang — bawaannya Ko Yosep — supaya verifikasi langsung jalan. Setelah ini diatur sendiri di
-- Setting → Approval Flow tanpa mengubah approver peminjaman. Tidak dibuat bila flow DEMO_LOAN_RETURN sudah ada
-- (aman dijalankan di database yang sudah mengaturnya). Id baru = "dlr_" + id sumber.

INSERT INTO "ApprovalFlow" ("id", "module", "division", "scope", "isActive", "autoApproveWhenSkipped")
SELECT 'dlr_' || f."id", 'DEMO_LOAN_RETURN', f."division", f."scope", f."isActive", f."autoApproveWhenSkipped"
FROM "ApprovalFlow" AS f
WHERE f."module" = 'DEMO_LOAN' AND f."scope" = 'REGULAR' AND f."deletedAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "ApprovalFlow" AS x WHERE x."module" = 'DEMO_LOAN_RETURN' AND x."deletedAt" IS NULL);

INSERT INTO "ApprovalFlowStep" ("id", "flowId", "level")
SELECT 'dlr_' || s."id", 'dlr_' || s."flowId", s."level"
FROM "ApprovalFlowStep" AS s
WHERE EXISTS (SELECT 1 FROM "ApprovalFlow" AS nf WHERE nf."id" = 'dlr_' || s."flowId")
  AND NOT EXISTS (SELECT 1 FROM "ApprovalFlowStep" AS ns WHERE ns."id" = 'dlr_' || s."id");

INSERT INTO "ApprovalStepApprover" ("stepId", "userId")
SELECT 'dlr_' || a."stepId", a."userId"
FROM "ApprovalStepApprover" AS a
WHERE EXISTS (SELECT 1 FROM "ApprovalFlowStep" AS ns WHERE ns."id" = 'dlr_' || a."stepId")
  AND NOT EXISTS (SELECT 1 FROM "ApprovalStepApprover" AS na WHERE na."stepId" = 'dlr_' || a."stepId" AND na."userId" = a."userId");
