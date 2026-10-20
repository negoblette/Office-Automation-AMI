#!/bin/bash
# Role database minimum (hardening Tahap 4, docs/08-INVENTARIS-DATA.md). Aman dijalankan berulang.
#   - Otomatis saat volume database pertama kali dibuat (dipasang ke /docker-entrypoint-initdb.d/10-roles.sh).
#   - Database yang sudah ada — dev: `npm run db:roles`; produksi:
#       docker compose -f docker-compose.prod.yml --env-file .env.production exec db bash /docker-entrypoint-initdb.d/10-roles.sh
# Role:
#   $POSTGRES_USER (oa) pemilik: migrasi, seed, Studio, test. Tidak dipakai aplikasi.
#   oa_app              aplikasi & worker: hanya SELECT/INSERT/UPDATE/DELETE isi tabel + pemilik skema antrian pgboss.
#   oa_backup           backup harian: hanya membaca (pg_read_all_data).
set -euo pipefail

: "${POSTGRES_USER:?}" "${POSTGRES_DB:?}"
: "${OA_APP_PASSWORD:?isi OA_APP_PASSWORD (password role oa_app)}"
: "${OA_BACKUP_PASSWORD:?isi OA_BACKUP_PASSWORD (password role oa_backup)}"
# Socket lokal di container produksi wajib password (pg_hba.conf) → pakai password pemilik.
export PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}"

psql -v ON_ERROR_STOP=1 --no-psqlrc --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=owner="$POSTGRES_USER" --set=dbname="$POSTGRES_DB" \
  --set=app_password="$OA_APP_PASSWORD" --set=backup_password="$OA_BACKUP_PASSWORD" <<'SQL'
-- Password tidak boleh ikut tercatat di log Postgres (produksi memakai log_statement=ddl).
SET log_statement = 'none';

SELECT 'CREATE ROLE oa_app' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'oa_app') \gexec
SELECT 'CREATE ROLE oa_backup' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'oa_backup') \gexec
ALTER ROLE oa_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 60 PASSWORD :'app_password';
ALTER ROLE oa_app SET statement_timeout = '60s';
ALTER ROLE oa_app SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE oa_backup WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5 PASSWORD :'backup_password';
GRANT pg_read_all_data TO oa_backup;

-- Hanya role yang disebut yang boleh terhubung ke database ini.
REVOKE ALL ON DATABASE :"dbname" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"dbname" TO oa_app, oa_backup;

-- Aplikasi: baca/tulis isi tabel; tidak bisa membuat, mengubah, atau menghapus tabel.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO oa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO oa_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO oa_app;
-- Tabel dari migrasi berikutnya (dibuat role pemilik) otomatis bisa dipakai aplikasi.
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO oa_app;
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO oa_app;

-- Antrian pg-boss: skemanya milik oa_app supaya worker bisa membuat & memperbarui tabel antriannya sendiri tanpa hak
-- CREATE di database (hak itu bisa dipakai membuat skema bernama "oa" yang membajak migrasi Prisma).
CREATE SCHEMA IF NOT EXISTS pgboss AUTHORIZATION oa_app;
ALTER SCHEMA pgboss OWNER TO oa_app;
-- Objek pgboss yang sudah ada (database lama / hasil restore, dibuat role pemilik) dipindahkan ke oa_app.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.oid::regclass AS name, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'pgboss' AND c.relkind IN ('r', 'p', 'v', 'm') AND pg_get_userbyid(c.relowner) <> 'oa_app' LOOP
    EXECUTE format('ALTER %s %s OWNER TO oa_app',
      CASE r.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END, r.name);
  END LOOP;
  -- Sequence yang terikat kolom ikut pindah bersama tabelnya.
  FOR r IN SELECT c.oid::regclass AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'pgboss' AND c.relkind = 'S' AND pg_get_userbyid(c.relowner) <> 'oa_app'
             AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype IN ('a', 'i')) LOOP
    EXECUTE format('ALTER SEQUENCE %s OWNER TO oa_app', r.name);
  END LOOP;
  FOR r IN SELECT p.oid::regprocedure AS name, p.prokind FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'pgboss' AND pg_get_userbyid(p.proowner) <> 'oa_app' LOOP
    EXECUTE format('ALTER %s %s OWNER TO oa_app', CASE r.prokind WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END, r.name);
  END LOOP;
  FOR r IN SELECT t.oid::regtype AS name FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE n.nspname = 'pgboss' AND t.typtype IN ('e', 'd') AND pg_get_userbyid(t.typowner) <> 'oa_app' LOOP
    EXECUTE format('ALTER TYPE %s OWNER TO oa_app', r.name);
  END LOOP;
END $$;
SQL

echo "[init-roles] role oa_app & oa_backup siap di database $POSTGRES_DB"
