#!/bin/bash
# Backup harian terenkripsi (URD NF-06, hardening Tahap 4) — dijalankan service "backup" di docker-compose.prod.yml.
#   - database : pg_dump format custom (role oa_backup, hanya baca) → age → /backups/db_YYYYMMDD_HHMM.dump.age
#   - upload   : tar.gz folder /uploads                              → age → /backups/uploads_YYYYMMDD_HHMM.tar.gz.age
#   - kunci    : salinan folder kunci pemulihan (/recovery)          →       /backups/kunci_YYYYMMDD_HHMM.tar
# Database & upload dikunci untuk gembok (kunci publik age) para pemegang kunci di /recovery/penerima.txt, yang ditulis
# aplikasi saat Pak Rudy / Pak Leonard membuat kata sandi pemulihan (Setting → Kunci Pemulihan). Minimal 2 pemegang kunci;
# kurang dari itu backup DITOLAK (container tetap hidup dan mencoba lagi di jadwal berikutnya).
# kunci_*.tar tidak perlu dienkripsi lagi: isinya kunci pribadi yang terkunci kata sandi pemulihan, titipan kunci data
# yang terkunci gembok, dan gembok itu sendiri. Server tidak pernah memegang kata sandi pemulihan (docs/08-INVENTARIS-DATA.md).
# Backup yang lebih tua dari BACKUP_KEEP_DAYS hari dihapus. Salin folder backups ke luar server: docs/07-DEPLOYMENT.md.
#
# Sekali jalan (mis. sebelum upgrade):  docker compose -f docker-compose.prod.yml exec backup /bin/bash /scripts/backup.sh --now
# Pulihkan:                             scripts/restore.sh --db <db_….dump.age> [--uploads <uploads_….tar.gz.age>]
set -euo pipefail
# File backup tidak boleh bisa ditulis user lain di server. `docker compose exec` (backup manual --now) berjalan dengan
# umask 0000 sehingga tanpa baris ini file jadi 666 (temuan gladi resik 2026-10-22); terjadwal sudah 0022.
umask 022

BACKUP_TIME="${BACKUP_TIME:-01:00}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
BACKUP_DIR=/backups
RECOVERY_DIR=/recovery
RECIPIENTS="$RECOVERY_DIR/penerima.txt"
MIN_HOLDERS=2

holder_count() {
  if [ -f "$RECIPIENTS" ]; then grep -c '^age1' "$RECIPIENTS" || true; else echo 0; fi
}

# Gembok dibaca ulang di setiap backup: pemegang kunci bisa membuat / mengganti kunci pemulihan kapan saja.
check_recipients() {
  local count
  count="$(holder_count)"
  if [ "$count" -lt "$MIN_HOLDERS" ]; then
    echo "[backup] DITOLAK: baru $count dari minimal $MIN_HOLDERS pemegang kunci yang membuat kunci pemulihan." \
      "Minta Pak Rudy & Pak Leonard membuka Setting → Kunci Pemulihan di aplikasi." >&2
    return 1
  fi
  if ! age -R "$RECIPIENTS" -o /dev/null < /dev/null; then
    echo "[backup] DITOLAK: $RECIPIENTS rusak — jalankan ulang service migrate (npm run recovery:refresh)" >&2
    return 1
  fi
}

run_backup() {
  local stamp db uploads keys
  check_recipients || return 1
  stamp="$(date +%Y%m%d_%H%M)"
  db="$BACKUP_DIR/db_${stamp}.dump.age"
  uploads="$BACKUP_DIR/uploads_${stamp}.tar.gz.age"
  keys="$BACKUP_DIR/kunci_${stamp}.tar"
  echo "[backup] $(date '+%F %T') mulai"
  # `|| return 1` di tiap langkah: di dalam `run_backup || …` bash mengabaikan set -e, jadi kegagalan dicek sendiri
  # (pipefail memastikan pg_dump/tar yang gagal ikut menggagalkan pipa).
  pg_dump --format=custom --no-owner | age -R "$RECIPIENTS" -o "$db.part" || return 1
  mv "$db.part" "$db" || return 1
  if [ -d /uploads ]; then
    tar -czf - -C /uploads . | age -R "$RECIPIENTS" -o "$uploads.part" || return 1
    mv "$uploads.part" "$uploads" || return 1
  fi
  # Kunci pemulihan yang berlaku SAAT backup ini dibuat — backup lama tetap bisa dibuka walau kunci sudah diganti.
  tar -cf "$keys.part" -C "$RECOVERY_DIR" --exclude='*.tmp' --exclude='*.baru' . || return 1
  mv "$keys.part" "$keys" || return 1
  find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db_*.dump' -o -name 'db_*.dump.age' -o -name 'uploads_*.tar.gz' -o -name 'uploads_*.tar.gz.age' -o -name 'kunci_*.tar' \) \
    -mtime "+${BACKUP_KEEP_DAYS}" -delete
  # Sisa backup yang gagal di tengah jalan.
  find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.part' -mmin +1440 -delete
  echo "[backup] $(date '+%F %T') selesai: $(basename "$db"), $(holder_count) pemegang kunci"
}

if [ "${1:-}" = "--now" ]; then
  run_backup
  exit 0
fi

echo "[backup] terjadwal setiap hari pukul ${BACKUP_TIME} (${TZ:-UTC}), retensi ${BACKUP_KEEP_DAYS} hari, $(holder_count) pemegang kunci terdaftar"
check_recipients || echo "[backup] belum bisa berjalan — dicoba lagi pukul ${BACKUP_TIME}" >&2
while true; do
  now=$(date +%s)
  next=$(date -d "today ${BACKUP_TIME}" +%s)
  [ "$next" -le "$now" ] && next=$(date -d "tomorrow ${BACKUP_TIME}" +%s)
  sleep $((next - now))
  run_backup || echo "[backup] GAGAL — cek log di atas" >&2
done
