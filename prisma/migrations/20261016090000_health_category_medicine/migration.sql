-- 2026-10-16: kategori klaim kesehatan "Obat-obatan" (data master; id acak karena cuid dibuat di aplikasi).
INSERT INTO "HealthCategory" ("id", "name", "isActive")
VALUES ('hc_' || substr(md5(random()::text || clock_timestamp()::text), 1, 22), 'Obat-obatan', true)
ON CONFLICT ("name") DO NOTHING;
