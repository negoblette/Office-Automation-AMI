#!/bin/sh
# Pembuka container reverse proxy (hardening Tahap 3). Dijalankan dengan `sh` dari compose,
# jadi tidak butuh izin eksekusi.
#  1. Membuat daftar jaringan yang boleh membuka aplikasi dari ALLOWED_SUBNETS (pisahkan koma/spasi).
#  2. Me-reload nginx tiap 6 jam supaya sertifikat yang diperbarui ikut terpakai tanpa restart.
#  3. Menjalankan entrypoint resmi image nginx (mengisi template ${APP_DOMAIN} dkk., lalu start nginx).
set -eu

: "${ALLOWED_SUBNETS:?isi ALLOWED_SUBNETS di .env.production}"

# APP_DOMAIN boleh berupa alamat IP (akses tanpa domain, 2026-10-29). Browser tidak mengirim SNI untuk alamat IP,
# jadi blok aplikasi harus menjadi default_server port 443; penolakan Host/SNI lain hanya berlaku di mode domain.
case "${APP_DOMAIN:?isi APP_DOMAIN di .env.production}" in
  *[!0-9.]*) export APP_DEFAULT_SERVER="" REJECT_DEFAULT_SERVER="default_server" ;;
  *) export APP_DEFAULT_SERVER="default_server" REJECT_DEFAULT_SERVER="" ;;
esac

{
  for subnet in $(echo "$ALLOWED_SUBNETS" | tr ',' ' '); do
    echo "allow $subnet;"
  done
  echo "deny all;"
} > /etc/nginx/conf.d/allowlist.inc

(
  while sleep 6h; do
    nginx -s reload || true
  done
) &

exec /docker-entrypoint.sh "$@"
