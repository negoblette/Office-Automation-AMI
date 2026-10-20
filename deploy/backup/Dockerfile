# Image backup (hardening Tahap 4, docs/08-INVENTARIS-DATA.md): klien PostgreSQL (pg_dump / pg_restore) + age untuk
# mengenkripsi hasil backup. Versi postgres disamakan dengan service "db" di docker-compose.prod.yml.
FROM postgres:17.11-trixie
RUN apt-get update \
 && apt-get install -y --no-install-recommends age \
 && rm -rf /var/lib/apt/lists/*
