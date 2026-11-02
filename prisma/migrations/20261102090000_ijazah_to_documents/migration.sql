-- Ijazah dipindah dari Sertifikat ke Dokumen (2026-11-02): ijazah yang punya file menjadi Dokumen "Ijazah + Transkrip"
-- milik karyawan yang sama (file yang sama), lalu semua sertifikat jenis IJAZAH di-soft delete (data tetap tersimpan).
INSERT INTO "Document" ("id", "ownerType", "employeeId", "docType", "fileKey", "fileName", "mimeType", "sizeBytes", "uploadedById", "createdAt")
SELECT
  'ijazah_' || c."id",
  'EMPLOYEE',
  c."employeeId",
  'IJAZAH_TRANSKRIP',
  c."fileKey",
  c."name" || '.' || lower(regexp_replace(c."fileKey", '^.*\.', '')),
  CASE lower(regexp_replace(c."fileKey", '^.*\.', ''))
    WHEN 'pdf' THEN 'application/pdf'
    WHEN 'png' THEN 'image/png'
    ELSE 'image/jpeg'
  END,
  COALESCE(f."sizeBytes", 0),
  COALESCE(f."uploaderId", u."id"),
  c."createdAt"
FROM "Certificate" c
LEFT JOIN "UploadedFile" f ON f."key" = c."fileKey"
LEFT JOIN "User" u ON u."employeeId" = c."employeeId"
WHERE c."type" = 'IJAZAH'
  AND c."deletedAt" IS NULL
  AND c."fileKey" IS NOT NULL
  AND COALESCE(f."uploaderId", u."id") IS NOT NULL;

UPDATE "Certificate" SET "deletedAt" = CURRENT_TIMESTAMP WHERE "type" = 'IJAZAH' AND "deletedAt" IS NULL;
