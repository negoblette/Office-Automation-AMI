-- Hardening Tahap 6 — audit log permanen: baris AuditLog tidak bisa diubah atau dihapus oleh siapa pun lewat
-- UPDATE/DELETE (termasuk aplikasi yang dibobol). Tidak ada perubahan schema.prisma; trigger tidak dikenal Prisma.
-- Akibatnya: User yang punya riwayat audit tidak bisa dihapus permanen (FK "SET NULL" = UPDATE) — memang disengaja,
-- akun dinonaktifkan, bukan dihapus. TRUNCATE (hanya pemilik tabel; dipakai reset database test) tidak terkena trigger.
CREATE OR REPLACE FUNCTION "audit_log_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog bersifat permanen: baris tidak boleh diubah atau dihapus'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "AuditLog_immutable"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION "audit_log_immutable"();

-- Lapisan kedua: role aplikasi (oa_app, bila ada) hanya boleh membaca & menambah baris audit.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'oa_app') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON "AuditLog" FROM oa_app;
  END IF;
END $$;
