#!/bin/bash
# Pulihkan backup terenkripsi (docs/07-DEPLOYMENT.md "Memulihkan dari backup", docs/08-INVENTARIS-DATA.md §5).
# Dijalankan PETUGAS IT di server, dari folder project, dengan salah satu pemegang kunci (Pak Rudy / Pak Leonard) hadir:
#   scripts/restore.sh --db backups/db_YYYYMMDD_HHMM.dump.age [--uploads backups/uploads_YYYYMMDD_HHMM.tar.gz.age] \
#                      [--kunci backups/kunci_YYYYMMDD_HHMM.tar]
# --kunci = salinan folder kunci pemulihan dari backup yang sama (default: kunci_<waktu yang sama dengan --db>.tar).
# Langkah:
#  1. pemegang kunci yang hadir memilih namanya lalu MENGETIK KATA SANDI PEMULIHAN-nya (diminta age, tidak tampil di
#     layar). Kunci pribadi yang terbuka hanya disimpan sementara di memori (/dev/shm) dan dihapus saat skrip selesai;
#  2. titipan kunci data dibuka; .env.production yang belum berisi kunci data yang valid (server baru) diisi otomatis;
#  3. app & worker dihentikan → database dipulihkan (sebagai pemilik) → role & kepemilikan skema antrian dipasang ulang
#     (init-roles) → file upload & folder kunci pemulihan dipulihkan → kunci data diperiksa → semua service dijalankan.
set -euo pipefail

# COMPOSE_FILE / COMPOSE_PROJECT_NAME dibaca docker compose sendiri (bisa diisi beberapa file, mis. untuk uji coba).
export COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
PROJECT="${COMPOSE_PROJECT_NAME:-office-automation-prod}"
compose() { docker compose -p "$PROJECT" --env-file "$ENV_FILE" "$@"; }
absolute() { echo "$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"; }
usage() { echo "Pakai: $0 --db <db_….dump.age> [--uploads <uploads_….tar.gz.age>] [--kunci <kunci_….tar>]" >&2; exit 1; }
# Format kunci data yang valid (src/lib/crypto/keys.ts); selain itu dianggap belum diisi (mis. contoh dari .env.production.example).
VALID_KEY='^[a-z0-9]{1,16}:[A-Za-z0-9+/]{43}='

db=""; uploads=""; keys=""
while [ $# -gt 0 ]; do
  case "$1" in
    --db) db="${2:-}"; shift 2 ;;
    --uploads) uploads="${2:-}"; shift 2 ;;
    --kunci) keys="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done
[ -f "$db" ] || usage
if [ -z "$keys" ]; then
  stamp="$(basename "$db" | sed -nE 's/^db_([0-9]{8}_[0-9]{4})\.dump\.age$/\1/p')"
  keys="$(dirname "$db")/kunci_${stamp}.tar"
fi
[ -f "$keys" ] || { echo "Salinan kunci pemulihan tidak ditemukan: $keys (pakai --kunci <kunci_….tar>)" >&2; exit 1; }
[ -z "$uploads" ] || [ -f "$uploads" ] || usage
db="$(absolute "$db")"; keys="$(absolute "$keys")"
[ -z "$uploads" ] || uploads="$(absolute "$uploads")"
[ -f "$ENV_FILE" ] || { echo "$ENV_FILE belum ada — salin dari .env.production.example lalu isi (docs/07-DEPLOYMENT.md)" >&2; exit 1; }
set -a; . "$ENV_FILE"; set +a
# Server baru: baris kunci data mungkin belum ada → nilai sementara supaya docker compose mau jalan. Kunci aslinya diisi
# dari titipan di bawah (lalu .env.production dibaca ulang dan menimpa nilai sementara ini).
export DATA_ENCRYPTION_KEYS="${DATA_ENCRYPTION_KEYS:-belum-diisi}" DATA_INDEX_KEY="${DATA_INDEX_KEY:-belum-diisi}"

read -rp "Database & file upload produksi akan DITIMPA dari backup. Ketik PULIHKAN untuk lanjut: " confirm
[ "$confirm" = "PULIHKAN" ] || { echo "Dibatalkan."; exit 1; }

# Folder kerja di memori (tmpfs): kunci pribadi yang terbuka tidak pernah ditulis ke disk.
base=/dev/shm
[ -d "$base" ] && [ -w "$base" ] || base="${TMPDIR:-/tmp}"
work="$(mktemp -d "$base/oa-restore.XXXXXX")"
trap 'rm -rf "$work"' EXIT
chmod 700 "$work"
tar -xf "$keys" -C "$work"
mapfile -t holders < <(cd "$work" && find . -maxdepth 1 -name 'kunci-pemulihan-*.age' | sed -E 's|^\./kunci-pemulihan-(.*)\.age$|\1|' | sort)
[ "${#holders[@]}" -gt 0 ] || { echo "Tidak ada kunci pemulihan di $(basename "$keys")" >&2; exit 1; }
[ -f "$work/kunci-data.age" ] || { echo "Titipan kunci data (kunci-data.age) tidak ada di $(basename "$keys")" >&2; exit 1; }

echo
echo "Pemegang kunci di backup ini:"
for i in "${!holders[@]}"; do echo "  $((i + 1)). ${holders[$i]}"; done
read -rp "Siapa yang hadir? Ketik nomornya: " choice
if ! [[ "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -lt 1 ] || [ "$choice" -gt "${#holders[@]}" ]; then
  echo "Pilihan tidak valid." >&2
  exit 1
fi
holder="${holders[$((choice - 1))]}"

# age berjalan di container backup (punya age) sebagai user host ini, supaya file hasilnya milik skrip ini.
as_me=(--user "$(id -u):$(id -g)" -v "$work:/run/restore")
# Teks yang diketik SEBELUM prompt age muncul masih tampil di layar (temuan gladi resik 2026-10-22) → minta menunggu.
echo "[restore] ${holder}: TUNGGU sampai muncul tulisan 'Enter passphrase:', baru ketik KATA SANDI PEMULIHAN Anda"
echo "          lalu tekan Enter. Kata sandi tidak tampil di layar saat diketik."
opened=""
for attempt in 1 2 3; do
  if compose run --rm --no-deps "${as_me[@]}" --entrypoint age backup -d -o /run/restore/identitas "/run/restore/kunci-pemulihan-${holder}.age"; then
    opened=1
    break
  fi
  rm -f "$work/identitas"
  echo "[restore] kata sandi pemulihan salah (percobaan $attempt dari 3)" >&2
done
[ -n "$opened" ] || { echo "Dibatalkan: kata sandi pemulihan salah 3 kali. Coba dengan pemegang kunci lain." >&2; exit 1; }
chmod 600 "$work/identitas"

echo "[restore] membuka titipan kunci data"
compose run --rm -T --no-deps "${as_me[@]}" --entrypoint age backup -d -i /run/restore/identitas -o /run/restore/kunci-data.env /run/restore/kunci-data.age
current="$(sed -nE 's/^DATA_ENCRYPTION_KEYS="?([^"]*)"?$/\1/p' "$ENV_FILE" | tail -n 1)"
if [[ "$current" =~ $VALID_KEY ]]; then
  echo "[restore] $ENV_FILE sudah berisi kunci data — tidak diubah (diperiksa di akhir)"
else
  echo "[restore] mengisi DATA_ENCRYPTION_KEYS & DATA_INDEX_KEY di $ENV_FILE dari titipan kunci data"
  sed -i -E '/^(DATA_ENCRYPTION_KEYS|DATA_INDEX_KEY)=/d' "$ENV_FILE"
  grep -E '^(DATA_ENCRYPTION_KEYS|DATA_INDEX_KEY)=' "$work/kunci-data.env" >> "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  set -a; . "$ENV_FILE"; set +a
fi

echo "[restore] menyalakan database & menghentikan app dan worker"
compose up -d --wait db
compose stop app worker

echo "[restore] memulihkan database dari $(basename "$db")"
# Di container backup (punya age & pg_restore) sebagai role pemilik; kunci pribadi hanya dipasang read-only.
compose run --rm -T --no-deps \
  -v "$work/identitas:/run/restore/kunci:ro" -v "$db:/run/restore/db.age:ro" \
  -e PGUSER="${POSTGRES_USER:-oa}" -e PGPASSWORD="$POSTGRES_PASSWORD" \
  --entrypoint bash backup -c \
  'set -o pipefail; age -d -i /run/restore/kunci /run/restore/db.age | pg_restore --clean --if-exists --no-owner --single-transaction --exit-on-error -d "$PGDATABASE"'

echo "[restore] memasang ulang role & kepemilikan skema antrian"
compose exec -T db bash /docker-entrypoint-initdb.d/10-roles.sh

if [ -n "$uploads" ]; then
  echo "[restore] memulihkan file upload dari $(basename "$uploads")"
  # Dibuka di container backup, diekstrak di container migrate (user node) supaya file tetap milik aplikasi.
  compose run --rm -T --no-deps -v "$work/identitas:/run/restore/kunci:ro" -v "$uploads:/run/restore/uploads.age:ro" \
    --entrypoint age backup -d -i /run/restore/kunci /run/restore/uploads.age \
    | compose run --rm -T --no-deps --entrypoint sh migrate -c 'find /app/storage/uploads -mindepth 1 -delete && tar -xzf - -C /app/storage/uploads'
fi

echo "[restore] memulihkan folder kunci pemulihan dari $(basename "$keys")"
compose run --rm -T --no-deps --entrypoint sh migrate -c 'find /app/storage/recovery -mindepth 1 -delete && tar -xf - -C /app/storage/recovery' < "$keys"

echo "[restore] memeriksa kunci data (semua data terenkripsi harus bisa dibuka)"
if ! compose run --rm -T --no-deps migrate npx tsx scripts/data-encrypt.ts --cek; then
  echo "[restore] GAGAL: kunci data di $ENV_FILE tidak bisa membuka data dari backup ini." >&2
  echo "          Bila server ini memakai kunci lain, hapus baris DATA_ENCRYPTION_KEYS & DATA_INDEX_KEY dari $ENV_FILE," >&2
  echo "          lalu jalankan restore lagi — kunci dari titipan akan dipakai." >&2
  exit 1
fi

echo "[restore] menjalankan semua service (migrate → app, worker, backup → proxy)"
compose up -d
echo "[restore] selesai. Catat pemulihan ini: tanggal, file backup yang dipakai, dan pemegang kunci yang hadir."
