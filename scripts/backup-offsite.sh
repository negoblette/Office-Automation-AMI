#!/bin/bash
# Salin folder backups/ ke LUAR server (aturan 3-2-1) — docs/07-DEPLOYMENT.md §7. Dijalankan di HOST server (bukan di
# container), dari cron / systemd timer setiap hari setelah backup harian selesai:
#   30 2 * * *  cd /opt/office-automation && bash scripts/backup-offsite.sh >> /var/log/oa-backup-offsite.log 2>&1
# Tujuan diatur di .env.production (isi salah satu atau keduanya):
#   OFFSITE_DIR       folder NAS yang sudah di-mount, mis. /mnt/nas-oa/office-automation (wajib berisi file penanda
#                     .oa-offsite, supaya NAS yang lepas tidak membuat salinan "diam-diam" ke disk server sendiri)
#   OFFSITE_RCLONE    remote rclone, mis. b2:oa-backup atau gdrive:oa-backup (dibuat dengan `rclone config`)
#   OFFSITE_KEEP_DAYS lama simpan di tujuan (default 90 hari; backup lokal hanya BACKUP_KEEP_DAYS)
#   OFFSITE_PING_URL  opsional: URL "push" monitor (Uptime Kuma / healthchecks.io) yang dipanggil bila berhasil —
#                     monitor memberi tahu bila tidak ada ping dalam 26 jam
# Isi backups/ sudah terenkripsi (age) — aman disalin ke NAS / cloud. Gagal (backup terbaru tidak lengkap / lebih tua dari
# 26 jam / tujuan tidak bisa ditulis) → keluar dengan kode 1 dan pesan jelas di log.
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE="${ENV_FILE:-.env.production}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
MAX_AGE_MINUTES=$((26 * 60))
log() { echo "[offsite] $(date '+%F %T') $*"; }
fail() { log "GAGAL: $*" >&2; exit 1; }

# Hanya variabel OFFSITE_* yang dibaca dari .env.production (tidak memuat rahasia lain ke shell ini).
if [ -f "$ENV_FILE" ]; then
  while IFS='=' read -r name value; do
    value="${value%\"}"; value="${value#\"}"
    case "$name" in OFFSITE_DIR | OFFSITE_RCLONE | OFFSITE_KEEP_DAYS | OFFSITE_PING_URL) [ -n "${!name:-}" ] || export "$name=$value" ;; esac
  done < <(grep -E '^OFFSITE_[A-Z_]+=' "$ENV_FILE" || true)
fi
OFFSITE_KEEP_DAYS="${OFFSITE_KEEP_DAYS:-90}"
[ -n "${OFFSITE_DIR:-}${OFFSITE_RCLONE:-}" ] || fail "OFFSITE_DIR / OFFSITE_RCLONE belum diisi di $ENV_FILE"
[[ "$OFFSITE_KEEP_DAYS" =~ ^[0-9]+$ ]] || fail "OFFSITE_KEEP_DAYS harus angka (hari)"

# Backup terbaru harus lengkap (database + upload + kunci pemulihan dengan waktu yang sama) dan belum basi.
latest="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'db_*.dump.age' -printf '%f\n' 2>/dev/null | sort | tail -n 1)"
[ -n "$latest" ] || fail "belum ada backup di $BACKUP_DIR"
stamp="${latest#db_}"; stamp="${stamp%.dump.age}"
for file in "db_${stamp}.dump.age" "uploads_${stamp}.tar.gz.age" "kunci_${stamp}.tar"; do
  [ -s "$BACKUP_DIR/$file" ] || fail "backup $stamp tidak lengkap: $file tidak ada / kosong"
done
[ -n "$(find "$BACKUP_DIR/$latest" -mmin "-$MAX_AGE_MINUTES")" ] || fail "backup terbaru ($stamp) lebih tua dari 26 jam — cek service backup (dc logs backup)"

PATTERNS=(db_*.dump.age uploads_*.tar.gz.age kunci_*.tar)

if [ -n "${OFFSITE_DIR:-}" ]; then
  [ -f "$OFFSITE_DIR/.oa-offsite" ] || fail "NAS tidak terpasang di $OFFSITE_DIR (file penanda .oa-offsite tidak ada)"
  # Tanpa --delete: tujuan menyimpan lebih lama dari server; yang tua dihapus terpisah di bawah.
  rsync -rt --exclude='*.part' --exclude='.*' "$BACKUP_DIR/" "$OFFSITE_DIR/"
  for file in "db_${stamp}.dump.age" "uploads_${stamp}.tar.gz.age" "kunci_${stamp}.tar"; do
    cmp -s "$BACKUP_DIR/$file" "$OFFSITE_DIR/$file" || fail "salinan $file di NAS berbeda dari aslinya"
  done
  find "$OFFSITE_DIR" -maxdepth 1 -type f \( -name "${PATTERNS[0]}" -o -name "${PATTERNS[1]}" -o -name "${PATTERNS[2]}" \) -mtime "+$OFFSITE_KEEP_DAYS" -delete
  log "NAS  : backup $stamp tersalin ke $OFFSITE_DIR ($(find "$OFFSITE_DIR" -maxdepth 1 -name 'db_*.dump.age' | wc -l) backup tersimpan)"
fi

if [ -n "${OFFSITE_RCLONE:-}" ]; then
  command -v rclone > /dev/null || fail "rclone belum terpasang (sudo apt install rclone)"
  rclone copy "$BACKUP_DIR" "$OFFSITE_RCLONE" --exclude '*.part' --exclude '.*' --no-traverse
  rclone check "$BACKUP_DIR" "$OFFSITE_RCLONE" --one-way --filter '- *.part' --filter "+ *_${stamp}.*" --filter '- *' > /dev/null 2>&1 ||
    fail "salinan backup $stamp di $OFFSITE_RCLONE tidak cocok"
  rclone delete "$OFFSITE_RCLONE" --min-age "${OFFSITE_KEEP_DAYS}d" --include 'db_*.dump.age' --include 'uploads_*.tar.gz.age' --include 'kunci_*.tar'
  log "cloud: backup $stamp tersalin ke $OFFSITE_RCLONE"
fi

if [ -n "${OFFSITE_PING_URL:-}" ]; then
  curl -fsS -m 10 --retry 3 "$OFFSITE_PING_URL" > /dev/null || log "peringatan: ping monitor gagal ($OFFSITE_PING_URL)"
fi
log "selesai"
