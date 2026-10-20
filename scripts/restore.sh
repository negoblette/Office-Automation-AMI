#!/bin/bash
# Pulihkan backup terenkripsi (hardening Tahap 4, docs/08-INVENTARIS-DATA.md). Jalankan di server, dari folder project:
#   scripts/restore.sh --kunci /media/usb/rudy.agekey --db backups/db_YYYYMMDD_HHMM.dump.age \
#                      [--uploads backups/uploads_YYYYMMDD_HHMM.tar.gz.age]
# --kunci = file kunci PRIBADI age milik salah satu pemegang kunci (Pak Rudy / Pak Leonard). Bawa dari tempat aman
#           (USB / brankas), jangan disalin ke server, cabut lagi setelah selesai.
# Langkah: hentikan app & worker → buka & pulihkan database (sebagai pemilik) → pasang ulang role & kepemilikan skema
# antrian (init-roles) → pulihkan file upload → cek kunci data → jalankan lagi app & worker.
# Kolom data pribadi di backup tetap terenkripsi: .env.production harus memuat DATA_ENCRYPTION_KEYS (termasuk kunci
# lama) & DATA_INDEX_KEY yang sama dengan saat backup dibuat.
set -euo pipefail

# COMPOSE_FILE / COMPOSE_PROJECT_NAME dibaca docker compose sendiri (bisa diisi beberapa file, mis. untuk uji coba).
export COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
PROJECT="${COMPOSE_PROJECT_NAME:-office-automation-prod}"
compose() { docker compose -p "$PROJECT" --env-file "$ENV_FILE" "$@"; }
absolute() { echo "$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"; }
usage() { echo "Pakai: $0 --kunci <file kunci pribadi age> --db <db_….dump.age> [--uploads <uploads_….tar.gz.age>]" >&2; exit 1; }

key=""; db=""; uploads=""
while [ $# -gt 0 ]; do
  case "$1" in
    --kunci) key="${2:-}"; shift 2 ;;
    --db) db="${2:-}"; shift 2 ;;
    --uploads) uploads="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done
[ -f "$key" ] && [ -f "$db" ] || usage
[ -z "$uploads" ] || [ -f "$uploads" ] || usage
key="$(absolute "$key")"; db="$(absolute "$db")"
[ -z "$uploads" ] || uploads="$(absolute "$uploads")"
set -a; . "$ENV_FILE"; set +a

read -rp "Database & file upload produksi akan DITIMPA dari backup. Ketik PULIHKAN untuk lanjut: " confirm
[ "$confirm" = "PULIHKAN" ] || { echo "Dibatalkan."; exit 1; }

echo "[restore] menghentikan app & worker"
compose stop app worker

echo "[restore] memulihkan database dari $(basename "$db")"
# Di container backup (punya age & pg_restore) sebagai role pemilik; kunci pribadi hanya dipasang read-only.
compose run --rm -T --no-deps \
  -v "$key:/run/restore/kunci:ro" -v "$db:/run/restore/db.age:ro" \
  -e PGUSER="${POSTGRES_USER:-oa}" -e PGPASSWORD="$POSTGRES_PASSWORD" \
  --entrypoint bash backup -c \
  'set -o pipefail; age -d -i /run/restore/kunci /run/restore/db.age | pg_restore --clean --if-exists --no-owner --single-transaction --exit-on-error -d "$PGDATABASE"'

echo "[restore] memasang ulang role & kepemilikan skema antrian"
compose exec -T db bash /docker-entrypoint-initdb.d/10-roles.sh

if [ -n "$uploads" ]; then
  echo "[restore] memulihkan file upload dari $(basename "$uploads")"
  # Dibuka di container backup, diekstrak di container migrate (user node) supaya file tetap milik aplikasi.
  compose run --rm -T --no-deps -v "$key:/run/restore/kunci:ro" -v "$uploads:/run/restore/uploads.age:ro" \
    --entrypoint age backup -d -i /run/restore/kunci /run/restore/uploads.age \
    | compose run --rm -T --no-deps --entrypoint sh migrate -c 'find /app/storage/uploads -mindepth 1 -delete && tar -xzf - -C /app/storage/uploads'
fi

echo "[restore] memeriksa kunci data (semua data terenkripsi harus bisa dibuka)"
compose run --rm -T --no-deps migrate npx tsx scripts/data-encrypt.ts --cek

echo "[restore] menjalankan lagi app & worker"
compose start app worker
echo "[restore] selesai"
