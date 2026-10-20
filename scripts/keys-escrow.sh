#!/bin/bash
# Titipkan salinan kunci data ke pemegang kunci (hardening Tahap 4, docs/08-INVENTARIS-DATA.md). Jalankan di server,
# dari folder project:   scripts/keys-escrow.sh
# Hasilnya kunci-data-YYYYMMDD.age: DATA_ENCRYPTION_KEYS & DATA_INDEX_KEY dari .env.production, dikunci untuk semua
# kunci publik di BACKUP_AGE_RECIPIENTS (Pak Rudy & Pak Leonard). Masing-masing bisa membukanya dengan kunci pribadinya:
#   age -d -i <kunci-pribadi>.agekey kunci-data-YYYYMMDD.age
# Serahkan satu salinan ke tiap pemegang kunci (USB / brankas), lalu hapus file dari server.
# Ulangi setiap kali kunci data diganti (rotasi) atau pemegang kunci berubah.
set -euo pipefail

# COMPOSE_FILE / COMPOSE_PROJECT_NAME dibaca docker compose sendiri (bisa diisi beberapa file, mis. untuk uji coba).
export COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
PROJECT="${COMPOSE_PROJECT_NAME:-office-automation-prod}"
compose() { docker compose -p "$PROJECT" --env-file "$ENV_FILE" "$@"; }

set -a; . "$ENV_FILE"; set +a
recipients=()
IFS=',' read -ra keys <<< "${BACKUP_AGE_RECIPIENTS:-}"
for key in "${keys[@]}"; do
  key="${key//[[:space:]]/}"
  if [ -n "$key" ]; then recipients+=(-r "$key"); fi
done
if [ "${#recipients[@]}" -lt 4 ]; then
  echo "DITOLAK: BACKUP_AGE_RECIPIENTS harus berisi minimal 2 kunci publik age (Pak Rudy & Pak Leonard)" >&2
  exit 1
fi

umask 077
out="kunci-data-$(date +%Y%m%d).age"
grep -E '^(DATA_ENCRYPTION_KEYS|DATA_INDEX_KEY)=' "$ENV_FILE" \
  | compose run --rm -T --no-deps --entrypoint age backup "${recipients[@]}" > "$out"
echo "Selesai: $out — serahkan satu salinan ke Pak Rudy & Pak Leonard, lalu hapus dari server."
