#!/bin/bash
# Backup harian terenkripsi (URD NF-06, hardening Tahap 4) — dijalankan service "backup" di docker-compose.prod.yml.
#   - database : pg_dump format custom (role oa_backup, hanya baca) → age → /backups/db_YYYYMMDD_HHMM.dump.age
#   - upload   : tar.gz folder /uploads                              → age → /backups/uploads_YYYYMMDD_HHMM.tar.gz.age
# Dienkripsi untuk semua kunci publik age di BACKUP_AGE_RECIPIENTS (minimal 2: Pak Rudy & Pak Leonard). Server hanya
# memegang kunci publik — backup hanya bisa dibuka dengan kunci pribadi salah satu pemegang kunci (docs/08-INVENTARIS-DATA.md).
# Backup yang lebih tua dari BACKUP_KEEP_DAYS hari dihapus.
#
# Sekali jalan (mis. sebelum upgrade):  docker compose -f docker-compose.prod.yml exec backup /bin/bash /scripts/backup.sh --now
# Pulihkan:                             scripts/restore.sh --kunci <file kunci age> --db <db_….dump.age> [--uploads <…>]
set -euo pipefail

BACKUP_TIME="${BACKUP_TIME:-01:00}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
BACKUP_DIR=/backups

# Penerima age: kunci publik "age1…" dipisah koma; minimal 2 pemegang kunci (keputusan 2026-10-20).
recipients=()
IFS=',' read -ra keys <<< "${BACKUP_AGE_RECIPIENTS:-}"
for key in "${keys[@]}"; do
  key="${key//[[:space:]]/}"
  if [ -n "$key" ]; then recipients+=(-r "$key"); fi
done
if [ "${#recipients[@]}" -lt 4 ]; then
  echo "[backup] DITOLAK: BACKUP_AGE_RECIPIENTS harus berisi minimal 2 kunci publik age (Pak Rudy & Pak Leonard)" >&2
  exit 1
fi
# Kunci publik yang salah ketik langsung ketahuan saat container start, bukan saat backup malam.
if ! age "${recipients[@]}" -o /dev/null < /dev/null; then
  echo "[backup] DITOLAK: ada kunci publik age yang tidak valid di BACKUP_AGE_RECIPIENTS" >&2
  exit 1
fi

run_backup() {
  local stamp db uploads
  stamp="$(date +%Y%m%d_%H%M)"
  db="$BACKUP_DIR/db_${stamp}.dump.age"
  uploads="$BACKUP_DIR/uploads_${stamp}.tar.gz.age"
  echo "[backup] $(date '+%F %T') mulai"
  # `|| return 1` di tiap langkah: di dalam `run_backup || …` bash mengabaikan set -e, jadi kegagalan dicek sendiri
  # (pipefail memastikan pg_dump/tar yang gagal ikut menggagalkan pipa).
  pg_dump --format=custom --no-owner | age "${recipients[@]}" -o "$db.part" || return 1
  mv "$db.part" "$db" || return 1
  if [ -d /uploads ]; then
    tar -czf - -C /uploads . | age "${recipients[@]}" -o "$uploads.part" || return 1
    mv "$uploads.part" "$uploads" || return 1
  fi
  find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db_*.dump' -o -name 'db_*.dump.age' -o -name 'uploads_*.tar.gz' -o -name 'uploads_*.tar.gz.age' \) \
    -mtime "+${BACKUP_KEEP_DAYS}" -delete
  # Sisa backup yang gagal di tengah jalan.
  find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.part' -mmin +1440 -delete
  echo "[backup] $(date '+%F %T') selesai: $(basename "$db")"
}

if [ "${1:-}" = "--now" ]; then
  run_backup
  exit 0
fi

echo "[backup] terjadwal setiap hari pukul ${BACKUP_TIME} (${TZ:-UTC}), retensi ${BACKUP_KEEP_DAYS} hari, $(( ${#recipients[@]} / 2 )) pemegang kunci"
while true; do
  now=$(date +%s)
  next=$(date -d "today ${BACKUP_TIME}" +%s)
  [ "$next" -le "$now" ] && next=$(date -d "tomorrow ${BACKUP_TIME}" +%s)
  sleep $((next - now))
  run_backup || echo "[backup] GAGAL — cek log di atas" >&2
done
