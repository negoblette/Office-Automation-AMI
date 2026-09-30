#!/bin/bash
# Backup harian (URD NF-06) — dijalankan service "backup" di docker-compose.prod.yml.
#   - database : pg_dump format custom  → /backups/db_YYYYMMDD_HHMM.dump
#   - upload   : tar.gz folder /uploads → /backups/uploads_YYYYMMDD_HHMM.tar.gz
# Backup yang lebih tua dari BACKUP_KEEP_DAYS hari dihapus.
#
# Sekali jalan (mis. sebelum upgrade):  docker compose -f docker-compose.prod.yml exec backup /bin/bash /scripts/backup.sh --now
# Restore database:  pg_restore --clean --if-exists -d office_automation db_YYYYMMDD_HHMM.dump
set -euo pipefail

BACKUP_TIME="${BACKUP_TIME:-01:00}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
BACKUP_DIR=/backups

run_backup() {
  local stamp
  stamp="$(date +%Y%m%d_%H%M)"
  echo "[backup] $(date '+%F %T') mulai"
  pg_dump --format=custom --no-owner --file="$BACKUP_DIR/db_${stamp}.dump.part"
  mv "$BACKUP_DIR/db_${stamp}.dump.part" "$BACKUP_DIR/db_${stamp}.dump"
  if [ -d /uploads ]; then
    tar -czf "$BACKUP_DIR/uploads_${stamp}.tar.gz.part" -C /uploads .
    mv "$BACKUP_DIR/uploads_${stamp}.tar.gz.part" "$BACKUP_DIR/uploads_${stamp}.tar.gz"
  fi
  find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db_*.dump' -o -name 'uploads_*.tar.gz' \) -mtime "+${BACKUP_KEEP_DAYS}" -delete
  echo "[backup] $(date '+%F %T') selesai: db_${stamp}.dump"
}

if [ "${1:-}" = "--now" ]; then
  run_backup
  exit 0
fi

echo "[backup] terjadwal setiap hari pukul ${BACKUP_TIME} (${TZ:-UTC}), retensi ${BACKUP_KEEP_DAYS} hari"
while true; do
  now=$(date +%s)
  next=$(date -d "today ${BACKUP_TIME}" +%s)
  [ "$next" -le "$now" ] && next=$(date -d "tomorrow ${BACKUP_TIME}" +%s)
  sleep $((next - now))
  run_backup || echo "[backup] GAGAL — cek log di atas" >&2
done
