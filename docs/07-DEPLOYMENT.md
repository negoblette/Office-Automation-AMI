# 07 — Panduan Deployment & Operasional Produksi

| | |
|---|---|
| **Sistem** | Office Automation System — PT Artha Mitra Interdata |
| **Disusun oleh** | Tim Intern: **Attariq Shaquille** dan **Nello Aurelius** |
| **Versi dokumen** | 1.2 (2026-10-22) |
| **Pembaca** | Petugas IT / admin server yang memasang dan merawat aplikasi di server kantor |
| **Status** | Lengkap. Gladi resik (§13) dijalankan Tim IT di server percobaan sebelum go-live |
| **Sumber kebenaran** | Kode di repository (`docker-compose.prod.yml`, `scripts/`). Bila berbeda, kode yang benar. |

Dokumen ini adalah panduan langkah demi langkah untuk memasang Office Automation System di server kantor, dari server
Ubuntu yang masih kosong sampai aplikasi dipakai karyawan. Isinya mencakup:
- pemasangan dan konfigurasi;
- kunci pemulihan;
- salinan backup ke luar server;
- pekerjaan rutin dan update;
- cara memulihkan semuanya bila server rusak;
- gladi resik, go-live, serah terima ke Tim IT;
- template berita acara.

Penjelasan keamanan data ada di `docs/08-INVENTARIS-DATA.md`; dokumentasi teknis lengkap ada di
`docs/09-DOKUMENTASI-TEKNIS.md`.

Kotak **Singkatnya**, **Contoh**, **Penting**, dan **Kenapa begini?** dipakai sama seperti di dokumen 09.

**Siapa mengerjakan apa**

| Peran | Orang | Tugasnya di dokumen ini |
|---|---|---|
| **Petugas IT / admin server** | Ditunjuk manajemen | Semua langkah teknis: server, konfigurasi, deploy, backup, salinan backup, pemulihan, gladi resik |
| **Pemegang kunci** | Pak Rudy & Pak Leonard | Membuat kata sandi pemulihan di aplikasi (§6.5); hadir dan mengetiknya saat pemulihan (§10). **Tanpa perintah teknis.** |
| **Admin aplikasi** | Bu Ika, Pak Rudy, Pak Leonard | Merapikan akun karyawan setelah aplikasi menyala (§6.4) |
| **Manajemen** | — | Menyediakan server; memutuskan tempat salinan backup: NAS dan/atau cloud (§7.3) |

**Urutan besar pekerjaan**
1. Siapkan bahan (§2).
2. Latihan lengkap di server percobaan: §3–§7 lalu uji pemulihan (§13.1–13.3, gladi resik).
3. Pasang di server produksi: §3–§7 (§13.4, go-live).
4. Serah terima ke Tim IT (§13.5).
5. Rawat secara rutin (§8–§12).

---

## Daftar isi
1. Gambaran sistem di server
2. Yang perlu disiapkan
3. Menyiapkan server Ubuntu
4. Mengisi konfigurasi `.env.production`
5. Sertifikat HTTPS
6. Deploy pertama
7. Menyalin backup ke luar server
8. Pekerjaan rutin
9. Memperbarui aplikasi
10. Memulihkan dari backup
11. Kunci enkripsi & pemegang kunci
12. Troubleshooting
13. Gladi resik, go-live & serah terima
14. Ringkasan perintah
15. Lampiran: template berita acara & lembar data instalasi

---

## 1. Gambaran sistem di server

> **Singkatnya:** semua bagian aplikasi berjalan sebagai container Docker di satu server Ubuntu. Pengguna hanya bisa
> masuk lewat satu pintu HTTPS (nginx); database tidak bisa dijangkau dari luar; backup dibuat setiap malam dalam
> keadaan terkunci, lalu disalin ke luar server.

```
  Komputer karyawan (LAN / VPN kantor)
            |  HTTPS (port 443)
            v
  +-------------------------- Server Ubuntu + Docker ---------------------------+
  |                                                                             |
  |   proxy (nginx) ---> app (Next.js) ---> db (PostgreSQL 17)                  |
  |                         |                  ^        ^                       |
  |                         |                  |        |                       |
  |                  volume uploads        worker    backup ---> folder backups |
  |                  volume recovery          |                                 |
  |                                           +---> server email (SMTP)         |
  +--------------------------------------------------------------+--------------+
                                                                 |
                                       scripts/backup-offsite.sh (setiap 02:30)
                                                                 v
                                                   NAS kantor dan/atau cloud
```

| Service | Fungsinya | Catatan |
|---|---|---|
| `proxy` | nginx: HTTPS, batas laju request, hanya menerima jaringan di `ALLOWED_SUBNETS` | Satu-satunya yang membuka port (80/443), hanya di IP `BIND_IP` |
| `app` | Aplikasi web | Memegang kunci data; menulis file kunci pemulihan |
| `worker` | Email, reminder, saldo cuti, potong cuti, hapus file lama | Tidak memegang kunci data |
| `db` | Database PostgreSQL 17 | Hanya di jaringan internal Docker |
| `migrate` | Sekali jalan setiap start: migrasi database, mengunci data lama, memperbarui titipan kunci | Statusnya "exited (0)" setelah selesai — itu normal |
| `backup` | Backup harian pukul `BACKUP_TIME` | Menolak jalan bila pemegang kunci yang sudah membuat kata sandi pemulihan kurang dari 2 |

Tempat data disimpan:

| Tempat | Isi | Ikut backup? |
|---|---|---|
| Volume `pgdata` | Database | Ya → `db_*.dump.age` |
| Volume `uploads` | File upload (terenkripsi) | Ya → `uploads_*.tar.gz.age` |
| Volume `recovery` | Kunci pemulihan pemegang kunci & titipan kunci data | Ya → `kunci_*.tar` |
| Folder `backups/` | Hasil backup | Disalin ke luar server (§7) |
| File `.env.production` | Semua rahasia & pengaturan | **Tidak** — lihat §4.3 |

---

## 2. Yang perlu disiapkan

### 2.1 Server
| Komponen | Minimal | Disarankan |
|---|---|---|
| Sistem operasi | Ubuntu Server 22.04 LTS | Ubuntu Server 24.04 LTS |
| CPU | 2 core | 4 core |
| RAM | 4 GB | 8 GB |
| Disk | 60 GB SSD | 200 GB SSD (data + backup lokal 14 hari) |
| Jaringan | IP LAN tetap (statis) | Ditambah akses internet keluar untuk email, update, dan backup cloud |
| Listrik | — | UPS, supaya server tidak sering mati mendadak |

Untuk gladi resik (§13) dibutuhkan juga **dua server percobaan** dengan spesifikasi minimal; boleh berupa mesin
virtual (VM).

> **Penting:** bila disk server dienkripsi (LUKS) saat instalasi Ubuntu — dan itu disarankan, supaya disk yang dicuri
> tidak bisa dibaca — server meminta passphrase setiap kali menyala. Siapkan buka-otomatis (TPM/Clevis) atau pastikan
> ada petugas yang mengetik passphrase setelah server restart. Kalau tidak, aplikasi tidak menyala sendiri setelah
> mati listrik.

### 2.2 Jaringan, domain & email
- **IP LAN tetap** untuk server (`BIND_IP`), dan daftar jaringan yang boleh membuka aplikasi, misalnya jaringan karyawan
  dan VPN (`ALLOWED_SUBNETS`).
- **Nama domain** aplikasi (`APP_DOMAIN`), misalnya `oa.artha-mitra.co.id`, yang di DNS kantor mengarah ke `BIND_IP`.
- **Sertifikat HTTPS** untuk domain tersebut (§5).
- **Akun email SMTP** yang mendukung TLS (port 465 atau 587) untuk notifikasi.
- **Tempat salinan backup**: NAS dan/atau cloud (§7.3) — keputusan manajemen.

### 2.3 Informasi dari manajemen
- Email akun aplikasi yang akan dipakai **Pak Rudy** dan **Pak Leonard** (untuk `RECOVERY_KEY_HOLDERS`).
- Daftar karyawan yang akan diinput Admin setelah aplikasi menyala.
- Petugas IT yang ditunjuk, beserta cadangannya.

Semua isian non-rahasia di atas dicatat di **Lembar Data Instalasi** (§15.4).

---

## 3. Menyiapkan server Ubuntu

### 3.1 Dasar
```bash
sudo apt update && sudo apt full-upgrade -y
sudo timedatectl set-timezone Asia/Jakarta
sudo apt install -y unattended-upgrades git rsync curl
sudo dpkg-reconfigure -plow unattended-upgrades      # update keamanan otomatis
```
- Login SSH memakai kunci (bukan password). Di `/etc/ssh/sshd_config` set `PasswordAuthentication no` dan
  `PermitRootLogin no`, lalu `sudo systemctl restart ssh`.
- Gunakan akun admin pribadi per petugas (bukan akun bersama), supaya jejak di server jelas.

### 3.2 Docker
Pasang Docker Engine dan plugin Compose dari repository resmi Docker:
```bash
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER        # keluar lalu login lagi supaya berlaku
docker compose version               # harus tampil versi v2.x
```
Docker otomatis menyala saat server boot, dan semua container aplikasi diatur `restart: unless-stopped`. Jadi setelah
mati listrik, aplikasi menyala sendiri tanpa perlu apa-apa.

> **Penting:** anggota grup `docker` setara root. Masukkan hanya petugas IT yang memang bertugas.

### 3.3 Pintu yang terbuka di server
> **Singkatnya:** panduan ini **tidak memakai firewall di server** (keputusan pemilik project, 2026-10-21).
> Pengamanan jaringan mengandalkan susunan aplikasi itu sendiri: hanya nginx yang membuka port, database tidak pernah
> dibuka ke luar, dan nginx menolak jaringan yang tidak terdaftar.

| Pintu (port) | Siapa yang bisa menjangkau | Pengamannya |
|---|---|---|
| **443 / 80** (nginx) | Hanya lewat IP `BIND_IP`; hanya jaringan di `ALLOWED_SUBNETS` — selain itu ditolak (403) | HTTPS wajib, HSTS, batas laju request, login + MFA |
| **22** (SSH) | Siapa pun yang bisa menjangkau server di jaringan | Login hanya dengan kunci SSH, tanpa root (§3.1) |
| **5432** (database), **3000** (aplikasi) | **Tidak dibuka sama sekali** ke luar server | Hanya jaringan internal Docker |

Pastikan tidak ada pintu lain yang terbuka:
```bash
sudo ss -tlnp
```
Yang boleh muncul hanya port 22, port 80/443 di `BIND_IP`, dan layanan sistem yang hanya mendengar di `127.0.0.x`
(misalnya DNS lokal Ubuntu di `127.0.0.53`).

> **Penting:** karena tidak ada firewall, **jangan memasang layanan lain** di server ini yang membuka port ke
> jaringan (database lain, panel web, file sharing, dan sejenisnya). Port seperti itu akan langsung terbuka ke seluruh
> jaringan kantor. Bila kantor memiliki firewall di tingkat jaringan (router), aturannya cukup mengizinkan port 443/80
> dari jaringan karyawan dan port 22 dari komputer Tim IT.

### 3.4 Kode aplikasi
```bash
sudo mkdir -p /opt/office-automation && sudo chown $USER: /opt/office-automation
git clone <url-repository> /opt/office-automation      # atau salin paket rilis dari tim pengembang
cd /opt/office-automation
echo "alias dc='docker compose -f docker-compose.prod.yml --env-file .env.production'" >> ~/.bashrc
source ~/.bashrc
```
Semua perintah `dc …` di dokumen ini dijalankan dari folder `/opt/office-automation`.

---

## 4. Mengisi konfigurasi `.env.production`

> **Singkatnya:** satu file berisi semua rahasia dan pengaturan produksi. Hanya admin server yang boleh membacanya,
> dan file ini tidak pernah di-commit ke repository.

```bash
cp .env.production.example .env.production
chmod 600 .env.production
nano .env.production
```

### 4.1 Membuat nilai rahasia
| Nilai | Cara membuat |
|---|---|
| `POSTGRES_PASSWORD`, `POSTGRES_APP_PASSWORD`, `POSTGRES_BACKUP_PASSWORD` | `openssl rand -hex 24` — tiga kali, masing-masing berbeda (huruf & angka saja, karena masuk URL koneksi) |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `DATA_ENCRYPTION_KEYS` | `echo "v1:$(openssl rand -base64 32)"` |
| `DATA_INDEX_KEY` | `openssl rand -base64 32` |
| `SEED_PASSWORD` | Password awal sementara untuk akun hasil seed (semua akun wajib menggantinya saat login pertama) |

> **Penting:** kunci data produksi **tidak boleh** sama dengan kunci dev atau kunci server percobaan, dan tidak pernah
> disalin ke laptop, chat, atau email. Salinannya dititipkan otomatis oleh sistem setelah pemegang kunci membuat kata
> sandi pemulihan (§6.5).

### 4.2 Daftar isian
| Variabel | Isi | Catatan |
|---|---|---|
| `POSTGRES_USER`, `POSTGRES_DB` | Biarkan bawaan (`oa`, `office_automation`) | |
| `POSTGRES_*PASSWORD` | Hasil §4.1 | |
| `DATA_ENCRYPTION_KEYS`, `DATA_INDEX_KEY` | Hasil §4.1 | Server baru hasil pemulihan: biarkan contoh, diisi `restore.sh` (§10.3) |
| `RECOVERY_KEY_HOLDERS` | Email akun Pak Rudy & Pak Leonard, dipisah koma | **Harus sama persis** dengan email login mereka di aplikasi |
| `APP_DOMAIN` | Domain aplikasi | Misalnya `oa.artha-mitra.co.id` |
| `BIND_IP` | IP LAN server | Jangan `0.0.0.0` |
| `ALLOWED_SUBNETS` | Jaringan yang boleh membuka aplikasi | Misalnya `192.168.20.0/24,10.8.0.0/24` |
| `TLS_CERT_PATH`, `TLS_KEY_PATH` | Lokasi sertifikat | Hanya diisi bila memakai Let's Encrypt (§5) |
| `BACKUP_TIME`, `BACKUP_KEEP_DAYS` | Jam backup & lama simpan di server | Bawaan `01:00` dan `14` hari |
| `OFFSITE_DIR`, `OFFSITE_RCLONE`, `OFFSITE_KEEP_DAYS`, `OFFSITE_PING_URL` | Tujuan salinan backup | Lihat §7 |
| `AUTH_SECRET` | Hasil §4.1 | |
| `AUTH_URL`, `APP_URL` | `https://<APP_DOMAIN>` | |
| `AUTH_TRUST_HOST`, `CSP_MODE` | Biarkan `true` dan `enforce` | |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Akun email | Wajib TLS; tanpa TLS email ditolak dan tercatat gagal |
| `STORAGE_DRIVER`, `MAX_UPLOAD_MB` | Biarkan `local` dan `5` | |
| `SEED_PASSWORD`, `SEED_MUST_CHANGE_PASSWORD` | Hasil §4.1, `true` | Dipakai sekali saat seed |

### 4.3 Menyimpan salinan konfigurasi
`.env.production` sengaja **tidak** ikut backup otomatis, karena isinya rahasia. Bila server rusak total, file ini bisa
dibuat ulang (§10.3): password database dan `AUTH_SECRET` boleh baru, sedangkan kunci data diambil otomatis dari titipan
di backup. Yang perlu dicatat terpisah, di pengelola password Tim IT, hanyalah akun SMTP / NAS / cloud. Pengaturan
non-rahasia (domain, IP, subnet) dicatat di Lembar Data Instalasi (§15.4).

---

## 5. Sertifikat HTTPS

> **Singkatnya:** nginx membutuhkan dua file: sertifikat (`fullchain.pem`) dan kunci privatnya (`privkey.pem`).

| Pilihan | Cocok bila | Langkah |
|---|---|---|
| **A. Sertifikat dari CA internal / dibeli** | Kantor punya CA sendiri, atau membeli sertifikat | Simpan di `deploy/certs/` (lihat di bawah) |
| **B. Let's Encrypt (DNS challenge)** | Domain publik milik kantor; server tidak perlu terbuka ke internet | `certbot` dengan plugin DNS penyedia domain |

**Pilihan A**
```bash
mkdir -p deploy/certs
cp /lokasi/fullchain.pem deploy/certs/fullchain.pem
cp /lokasi/privkey.pem   deploy/certs/privkey.pem
chmod 600 deploy/certs/privkey.pem
```
Bila memakai CA internal, sertifikat root CA harus dipasang di komputer karyawan (oleh Tim IT) supaya browser tidak
menampilkan peringatan.

**Pilihan B** (contoh untuk domain yang DNS-nya di Cloudflare):
```bash
sudo apt install -y certbot python3-certbot-dns-cloudflare
sudo certbot certonly --dns-cloudflare --dns-cloudflare-credentials /root/.cloudflare.ini \
  -d oa.artha-mitra.co.id --config-dir /opt/office-automation/deploy/letsencrypt
```
Lalu di `.env.production`:
```
TLS_CERT_PATH="/etc/letsencrypt/live/oa.artha-mitra.co.id/fullchain.pem"
TLS_KEY_PATH="/etc/letsencrypt/live/oa.artha-mitra.co.id/privkey.pem"
```
Perpanjangan otomatis (cron root): `0 3 * * * certbot renew -q --config-dir /opt/office-automation/deploy/letsencrypt`.
nginx memuat ulang sertifikat sendiri setiap 6 jam, jadi tidak perlu restart.

---

## 6. Deploy pertama

### 6.1 Menyalakan aplikasi
```bash
dc up -d --build
dc ps
```
Yang terjadi, berurutan:
1. Image dibangun (beberapa menit pada percobaan pertama).
2. `db` menyala dan membuat role database (`oa`, `oa_app`, `oa_backup`).
3. `migrate` menjalankan migrasi, mengunci data lama (`data:encrypt`), memperbarui file kunci pemulihan
   (`recovery:refresh`), lalu berhenti dengan status `exited (0)`.
4. `app`, `worker`, dan `backup` menyala; `proxy` menyala setelah `app` sehat.

Hasil `dc ps` yang benar: `db` dan `app` berstatus *healthy*, `worker`, `proxy`, `backup` berstatus *running*, dan
`migrate` *exited (0)*.

Pada deploy pertama, dua pesan berikut **normal**:
- `dc logs migrate` → `[recovery:refresh] PERINGATAN: … belum ada pemegang kunci yang membuat kunci pemulihan`;
- `dc logs backup` → `[backup] DITOLAK: baru 0 dari minimal 2 pemegang kunci …`.

Keduanya hilang setelah langkah §6.5.

### 6.2 Data awal (seed)
```bash
dc run --rm migrate npx prisma db seed
```
Seed membuat divisi, master data, alur approval, dan akun awal: Yosep, Rudy, Darwin, Leonard, Ika, ditambah tiga akun
staf contoh (Andi Pratama, Sinta Lestari, Devi). Semua memakai `SEED_PASSWORD` dan email `…@artha-mitra.local`, dan
wajib ganti password saat login pertama.

### 6.3 Cek dari komputer karyawan
- Buka `https://<APP_DOMAIN>` → halaman login tampil tanpa peringatan sertifikat.
- Buka `https://<APP_DOMAIN>/api/health` → `{"status":"ok","database":"ok"}`.
- Dari server sendiri, IP server biasanya tidak termasuk `ALLOWED_SUBNETS`, sehingga nginx menjawab 403. Itu normal.

### 6.4 Merapikan akun awal (Admin aplikasi)
1. Login sebagai Admin dengan `SEED_PASSWORD`, ganti password (minimal 15 karakter), lalu daftarkan MFA (Google /
   Microsoft Authenticator). Ini wajib untuk Admin dan Approver.
2. Ganti email akun hasil seed menjadi email kantor yang sebenarnya, lewat **Karyawan → edit**. Ini termasuk akun
   Pak Rudy dan Pak Leonard.
3. Samakan `RECOVERY_KEY_HOLDERS` di `.env.production` dengan email baru Pak Rudy & Pak Leonard, lalu jalankan
   `dc up -d`. **Lakukan ini sebelum §6.5.**
4. Nonaktifkan akun staf contoh (Setting → User) bila bukan karyawan sebenarnya.
5. Tambahkan karyawan lain.

### 6.5 Pemegang kunci membuat kata sandi pemulihan

> **Panduan singkat untuk Pak Rudy & Pak Leonard** (tanpa perintah teknis):
> - Login ke aplikasi seperti biasa.
> - Di dashboard ada kotak **"Kunci pemulihan Anda belum dibuat"**. Klik **Buka Kunci Pemulihan** (atau buka menu
>   Setting → kartu Kunci Pemulihan).
> - Ketik **kata sandi pemulihan** (minimal 15 karakter, berbeda dari password login — paling mudah berupa kalimat),
>   ulangi sekali lagi, ketik password login Anda, centang pernyataan, lalu klik **Simpan Kunci Pemulihan**.
> - Simpan kata sandi itu di ingatan atau di pengelola password pribadi. Jangan ditulis di kertas yang mudah ditemukan,
>   dan jangan dikirim lewat chat.
> - Setiap 3 bulan dashboard mengingatkan Anda untuk **menguji** kata sandi itu di halaman yang sama.

Setelah keduanya selesai, halaman Kunci Pemulihan menampilkan **"Backup berjalan"**, dan semua Admin menerima email
pemberitahuan. Petugas IT bisa memastikan filenya sudah ada:
```bash
dc exec app ls /app/storage/recovery
# BACA-SAYA.txt  kunci-data.age  penerima.txt
# kunci-pemulihan-<email Pak Rudy>.age  kunci-pemulihan-<email Pak Leonard>.age
```

> **Kenapa begini?** Kata sandi pemulihan dibuat sendiri oleh Direktur dan tidak disimpan di mana pun. Jadi petugas
> IT — yang memegang server — tetap tidak bisa membuka backup sendirian. Detailnya: `docs/08-INVENTARIS-DATA.md` §4.

### 6.6 Backup pertama
```bash
dc exec backup /bin/bash /scripts/backup.sh --now
ls -lh backups/
```
Harus ada tiga file dengan waktu yang sama, misalnya `db_20261103_1015.dump.age`, `uploads_20261103_1015.tar.gz.age`,
dan `kunci_20261103_1015.tar`. Setelah itu siapkan salinan ke luar server (§7) dan jalankan sekali secara manual.

### 6.7 Uji pemulihan sebelum go-live
Seluruh langkah di bab ini, termasuk pemulihan dari backup, **wajib dilatih dulu di server percobaan** (gladi resik,
§13). Dengan begitu prosedurnya terbukti jalan sebelum benar-benar dibutuhkan.

---

## 7. Menyalin backup ke luar server

### 7.1 Kenapa harus disalin
> **Singkatnya:** backup yang hanya tersimpan di server ikut hilang bila server rusak, dicuri, atau terkena
> ransomware. Karena itu setiap hari folder `backups/` disalin otomatis ke tempat lain.

Praktik yang umum dipakai adalah **aturan 3-2-1**: **3** salinan data, di **2** jenis media berbeda, dan **1** salinan
di luar gedung. Di sini:
- **salinan 1** adalah data asli di server;
- **salinan 2** adalah folder `backups/` di server (14 hari);
- **salinan 3** adalah NAS dan/atau cloud (90 hari).

File backup aman disalin ke mana pun karena **sudah terkunci**:
- database dan file upload dikunci untuk gembok para pemegang kunci;
- `kunci_*.tar` hanya berisi kunci yang terkunci kata sandi pemulihan.

Tanpa kata sandi pemulihan Pak Rudy atau Pak Leonard, isinya tidak bisa dibuka.

### 7.2 Apa yang disalin & berapa besar
| File (per waktu backup) | Isi | Ukuran |
|---|---|---|
| `db_YYYYMMDD_HHMM.dump.age` | Seluruh database | Kecil (MB) |
| `uploads_YYYYMMDD_HHMM.tar.gz.age` | **Semua** file upload (bukan hanya yang baru) | Terbesar — sebesar total file upload |
| `kunci_YYYYMMDD_HHMM.tar` | Kunci pemulihan & titipan kunci data saat itu | Sangat kecil (KB) |

Perkiraan ruang di tempat tujuan ≈ `OFFSITE_KEEP_DAYS` × (ukuran database + total file upload).

> **Contoh:** bila total file upload 5 GB dan salinan disimpan 90 hari, dibutuhkan sekitar 450 GB. Bila disimpan
> 30 hari, cukup sekitar 150 GB. Cek ukuran sebenarnya dengan `du -sh backups/`, lalu atur `OFFSITE_KEEP_DAYS`
> sesuai kapasitas.

### 7.3 Memilih tempat tujuan
| Pilihan | Kelebihan | Kekurangan |
|---|---|---|
| **NAS kantor** (Synology, QNAP, …) | Cepat, tanpa biaya bulanan, data tetap di kantor | Ikut hilang bila gedung terbakar atau kebanjiran |
| **Cloud** (Backblaze B2, Wasabi, AWS S3, Google Drive) | Ada di luar gedung, aman dari bencana lokal | Biaya bulanan, butuh internet |
| **HDD eksternal** | Murah | Manual, mudah lupa |

**Rekomendasi:** minimal NAS. Idealnya NAS **ditambah** cloud — skrip mendukung keduanya sekaligus. HDD eksternal hanya
untuk sementara, sampai NAS atau cloud tersedia.

> **Penting:** menyimpan data pribadi karyawan di cloud (apalagi di luar negeri) perlu dicatat dan disetujui manajemen.
> File sudah terenkripsi, tetapi keputusan tempat penyimpanan tetap ada di manajemen.

### 7.4 Cara A — NAS kantor (SMB / Windows share)
**Di NAS** (oleh Tim IT):
1. Buat shared folder khusus, misalnya `backup-oa`.
2. Buat user khusus `oa-backup` yang hanya berhak ke folder itu.
3. Aktifkan **snapshot** harian (simpan minimal 30 hari). Snapshot melindungi salinan bila server terkena ransomware
   lalu ikut menghapus isi NAS.
4. Pakai RAID 1, supaya satu disk NAS yang rusak tidak menghilangkan salinan.

**Di server:**
```bash
sudo apt install -y cifs-utils
sudo mkdir -p /mnt/nas-oa
sudo install -m 600 /dev/null /root/.nas-oa-credentials
sudo nano /root/.nas-oa-credentials
#   username=oa-backup
#   password=<password user NAS>
```
Tambahkan satu baris ke `/etc/fstab` (ganti IP & nama share). Perintah di bawah menyusun baris itu supaya aman disalin:
```bash
OPTS="credentials=/root/.nas-oa-credentials,vers=3.0,file_mode=0600,dir_mode=0700"
OPTS="$OPTS,_netdev,nofail,x-systemd.automount"
echo "//192.168.10.20/backup-oa /mnt/nas-oa cifs $OPTS 0 0" | sudo tee -a /etc/fstab
```
Lalu:
```bash
sudo systemctl daemon-reload
sudo mkdir -p /mnt/nas-oa/office-automation
sudo touch /mnt/nas-oa/office-automation/.oa-offsite      # file penanda (lihat di bawah)
```
Di `.env.production`: `OFFSITE_DIR="/mnt/nas-oa/office-automation"`. Uji: `sudo bash scripts/backup-offsite.sh`.

> **Kenapa ada file `.oa-offsite`?** Bila NAS mati atau terputus, folder `/mnt/nas-oa` hanyalah folder kosong di disk
> server. Tanpa penanda, skrip akan "berhasil" menyalin ke disk server sendiri dan tidak ada yang sadar. Dengan
> penanda, skrip langsung gagal dengan pesan "NAS tidak terpasang".

NAS yang memakai NFS: pasang `nfs-common`, lalu pakai baris fstab berikut sebagai ganti baris CIFS di atas:
```bash
sudo apt install -y nfs-common
echo "192.168.10.20:/volume1/backup-oa /mnt/nas-oa nfs defaults,_netdev,nofail,x-systemd.automount 0 0" \
  | sudo tee -a /etc/fstab
```

### 7.5 Cara B — Cloud lewat rclone
`rclone` adalah alat standar untuk menyalin file ke hampir semua penyedia cloud.
```bash
sudo apt install -y rclone
sudo rclone config
```
Contoh untuk **Backblaze B2**:
1. Di situs Backblaze, buat bucket **private** (misalnya `oa-backup-artha`).
2. Buat *application key* yang hanya berhak ke bucket itu.
3. Di `rclone config`: pilih `n` (remote baru), beri nama `b2`, pilih jenis `b2`, lalu isi `account` (keyID) dan `key`
   (applicationKey). Pilihan lain biarkan bawaan.
4. Uji koneksinya: `sudo rclone lsd b2:`.

Di `.env.production`: `OFFSITE_RCLONE="b2:oa-backup-artha"`. Uji: `sudo bash scripts/backup-offsite.sh`.

Penyedia lain caranya mirip: pilih jenis `s3` untuk AWS S3 atau Wasabi, dan `drive` untuk Google Drive. Google Drive
butuh izin lewat browser; jalankan `rclone authorize "drive"` di laptop, lalu tempel token yang dihasilkan.

> **Penting:** `/root/.config/rclone/rclone.conf` berisi kunci akses cloud. Hanya root yang boleh membacanya.
> Penyedia seperti B2 dan S3 juga punya fitur *Object Lock*. Fitur ini membuat file tidak bisa dihapus selama
> beberapa hari, sebagai perlindungan tambahan dari ransomware.

### 7.6 Cara C — HDD eksternal (manual, sementara)
Seminggu sekali:
```bash
sudo mount /dev/sdX1 /mnt/hdd-oa          # cek nama disk dengan: lsblk
sudo rsync -rt --exclude='*.part' /opt/office-automation/backups/ /mnt/hdd-oa/office-automation/
sync && sudo umount /mnt/hdd-oa
```
Simpan HDD di luar gedung (misalnya brankas di lokasi lain), lalu catat tanggalnya.

### 7.7 Menjadwalkan salinan otomatis
```bash
sudo crontab -e
# tambahkan baris ini (02:30, setelah backup 01:00 selesai):
30 2 * * * cd /opt/office-automation && bash scripts/backup-offsite.sh >> /var/log/oa-backup-offsite.log 2>&1
```
Bila `BACKUP_TIME` diubah, geser jadwal ini supaya tetap sesudahnya. Supaya log tidak membengkak:
```bash
sudo tee /etc/logrotate.d/oa-backup-offsite > /dev/null <<'EOF'
/var/log/oa-backup-offsite.log {
  monthly
  rotate 12
  compress
  missingok
  notifempty
}
EOF
```

Setiap kali jalan, `scripts/backup-offsite.sh` memeriksa dan mengerjakan hal berikut:
1. Backup terbaru **lengkap** (tiga file dengan waktu yang sama) dan **belum basi** (kurang dari 26 jam).
2. Tujuan benar-benar terpasang (file penanda NAS ada; `rclone` tersedia).
3. Menyalin; file setengah jadi (`*.part`) tidak ikut.
4. Membandingkan salinan backup terbaru dengan aslinya.
5. Menghapus salinan yang lebih tua dari `OFFSITE_KEEP_DAYS` di tempat tujuan (backup di server tetap
   `BACKUP_KEEP_DAYS`).
6. Bila ada yang salah: keluar dengan kode 1 dan pesan `GAGAL: …` yang jelas di log.

### 7.8 Diberi tahu bila gagal
- **Disarankan:** isi `OFFSITE_PING_URL` dengan URL *push monitor* dari Uptime Kuma (dipasang Tim IT) atau
  healthchecks.io, dengan interval 26 jam. Bila salinan gagal atau server mati, tidak ada "ping" dan monitor
  mengirim notifikasi (email / Telegram).
- **Tanpa monitor:** setiap minggu jalankan `tail -n 20 /var/log/oa-backup-offsite.log`. Baris terakhir harus
  `selesai`, bertanggal hari ini atau kemarin.
- Uptime Kuma yang sama bisa sekalian memantau `https://<APP_DOMAIN>/api/health`.

### 7.9 Memeriksa salinan secara berkala
| Kapan | Apa yang dicek |
|---|---|
| Mingguan | Log salinan (§7.8); `ls -lt /mnt/nas-oa/office-automation \| head` atau `rclone ls b2:oa-backup-artha` — ada tiga file per hari |
| Bulanan | Ruang kosong NAS / tagihan cloud; snapshot NAS berjalan |
| 3 bulan | **Uji pemulihan dari salinan NAS / cloud** ke server percobaan (§10.3), dengan salah satu Direktur hadir |

---

## 8. Pekerjaan rutin

| Kapan | Siapa | Pekerjaan |
|---|---|---|
| Harian (otomatis) | Sistem | Backup 01:00, salinan ke luar server 02:30, update keamanan OS |
| Mingguan | Petugas IT | Cek log backup (`dc logs --tail=20 backup`) & salinan; `dc ps` semua sehat; baca email alarm keamanan |
| Bulanan | Petugas IT | `sudo apt full-upgrade` lalu reboot bila diminta (aplikasi menyala sendiri); cek `df -h` & `du -sh backups/`; cek masa berlaku sertifikat; `sudo ss -tlnp` tetap hanya 22/80/443 (§3.3) |
| 3 bulan | Petugas IT + 1 Direktur | Uji pemulihan di server percobaan (catat dengan berita acara §15.2); para Direktur menguji kata sandi pemulihan (diingatkan dashboard) |
| Berkala (disarankan tahunan) | Petugas IT | Rotasi kunci data (`docs/08-INVENTARIS-DATA.md` §5.2); tinjau daftar Admin & pemegang kunci |

---

## 9. Memperbarui aplikasi

```bash
cd /opt/office-automation
dc exec backup /bin/bash /scripts/backup.sh --now     # backup dulu sebelum update
sudo bash scripts/backup-offsite.sh                   # dan salin ke luar server
git pull                                              # atau salin paket rilis baru
dc up -d --build --force-recreate
dc ps && dc logs --tail=50 migrate
```
- `migrate` menjalankan migrasi database baru secara otomatis. Aplikasi tidak bisa diakses sebentar (± 1 menit) saat
  container diganti.

> **Kenapa `--force-recreate`?** Beberapa container membaca file langsung dari folder project (misalnya
> `scripts/backup.sh` dan konfigurasi nginx). Setelah `git pull`, container yang sedang berjalan **tetap memakai versi
> lama** sampai dibuat ulang — temuan gladi resik 2026-10-22. `--force-recreate` memastikan semua container memakai
> versi baru. Data tetap aman karena tersimpan di volume.
- Bandingkan `.env.production` dengan contoh versi baru, karena mungkin ada variabel baru:
  ```bash
  diff <(grep -oE '^[A-Z_]+=' .env.production.example | sort) <(grep -oE '^[A-Z_]+=' .env.production | sort)
  ```
- **Bila update gagal**, kembali ke versi sebelumnya dengan `git checkout <versi-sebelumnya> && dc up -d --build`.
  Bila migrasi sudah mengubah database dan versi lama tidak cocok lagi, pulihkan backup yang dibuat sebelum update
  (§10.2).
- Update besar sebaiknya dicoba dulu di server percobaan.

---

## 10. Memulihkan dari backup

> **Singkatnya:** petugas IT menjalankan `scripts/restore.sh`. Salah satu pemegang kunci (Pak Rudy **atau**
> Pak Leonard) hadir dan mengetik kata sandi pemulihannya. Skrip mengerjakan sisanya.

### 10.1 Kapan dipakai
| Kejadian | Yang dilakukan |
|---|---|
| Mati listrik, server restart, update | **Tidak perlu pemulihan.** Aplikasi menyala sendiri, kunci tetap di server |
| Data terhapus / rusak, server masih sehat | §10.2, dengan backup sebelum kejadian |
| Server rusak total, dicuri, disk mati, `.env.production` hilang | §10.3, di server baru |
| Gladi resik & uji berkala (3 bulan) | §10.3, di server percobaan |

### 10.2 Pemulihan di server yang masih ada
1. Pilih waktu backup yang akan dipulihkan: `ls backups/`.
2. Pastikan salah satu pemegang kunci hadir.
3. Jalankan:
   ```bash
   bash scripts/restore.sh --db backups/db_20261103_0100.dump.age --uploads backups/uploads_20261103_0100.tar.gz.age
   ```
4. Ketik `PULIHKAN`. Skrip menampilkan daftar pemegang kunci; ketik nomor Direktur yang hadir.
5. Direktur **menunggu sampai muncul tulisan `Enter passphrase:`**, lalu mengetik kata sandi pemulihannya dan menekan
   Enter. Kata sandi tidak tampil di layar; ada 3 kesempatan. Jangan mengetik sebelum tulisan itu muncul — teks yang
   diketik terlalu cepat masih terlihat di layar.
6. Skrip melanjutkan sendiri: membuka titipan kunci data, menghentikan app & worker, memulihkan database, role, file
   upload, dan folder kunci pemulihan, memeriksa kunci data, lalu menyalakan semua service.
7. Login dan cek beberapa data.
8. Catat dengan berita acara pemulihan (§15.2).

> **Penting:** semua perubahan setelah waktu backup itu hilang. Catat apa saja yang perlu diinput ulang.

### 10.3 Pemulihan ke server baru
1. Siapkan server baru sesuai §3, dengan kode aplikasi versi yang sama atau lebih baru.
2. Buat `.env.production` sesuai §4. Password database dan `AUTH_SECRET` boleh baru (semua orang cukup login ulang).
   **Biarkan baris `DATA_ENCRYPTION_KEYS` dan `DATA_INDEX_KEY` berisi contoh** — skrip mengisinya dari titipan.
3. Pasang sertifikat (§5).
4. Ambil tiga file backup terbaru (waktu yang sama) dari NAS atau cloud ke folder `backups/`:
   ```bash
   mkdir -p backups
   cp /mnt/nas-oa/office-automation/*_20261103_0100.* backups/                   # dari NAS
   rclone copy b2:oa-backup-artha backups --include "*_20261103_0100.*"         # atau dari cloud
   ```
5. Dengan salah satu pemegang kunci hadir, jalankan perintah yang sama seperti §10.2 langkah 3–6. Pada server baru,
   skrip juga membangun image (beberapa menit) dan mengisi kunci data di `.env.production`.
6. Periksa:
   - `dc ps` → semua sehat;
   - login → buka profil seorang karyawan, data pribadinya tampil (berarti kunci data benar);
   - unduh satu file dokumen → terbuka (berarti file upload pulih);
   - Setting → Kunci Pemulihan → status kedua Direktur "Aktif".
7. Pasang lagi jadwal salinan backup (§7), lalu jalankan backup `--now` dan salinannya.
8. Buat berita acara pemulihan (§15.2).

> **Contoh:** Senin pagi server kantor tidak menyala karena disk rusak. Petugas IT memasang Ubuntu di server cadangan
> (§3), membuat `.env.production` baru, lalu menyalin `db_`, `uploads_`, dan `kunci_20261102_0100` dari NAS. Pukul 10.00
> Pak Leonard datang dan mengetik kata sandi pemulihannya saat diminta. Dua puluh menit kemudian aplikasi kembali
> berjalan dengan data per Senin pukul 01.00.

### 10.4 Bila kata sandi pemulihan salah
Skrip memberi 3 kesempatan. Bila tetap salah, ulangi dengan pemegang kunci yang lain. Bila **semua** pemegang kunci
lupa kata sandinya dan server sudah rusak, data pribadi yang terenkripsi tidak bisa dipulihkan
(`docs/08-INVENTARIS-DATA.md` §5.5). Itulah gunanya uji kata sandi setiap 3 bulan.

---

## 11. Kunci enkripsi & pemegang kunci

Ringkasan; detail ada di `docs/08-INVENTARIS-DATA.md` §4–5.

| Situasi | Langkah |
|---|---|
| Rotasi kunci data | Tambah kunci baru di depan `DATA_ENCRYPTION_KEYS` (`echo "v2:$(openssl rand -base64 32)"`), lalu `dc up -d`. Titipan diperbarui otomatis. Kunci lama **jangan dihapus** |
| Direktur lupa kata sandi pemulihan | Direktur membuat kata sandi baru di Setting → Kunci Pemulihan ("Ganti") |
| Email akun pemegang kunci diganti | Perbarui `RECOVERY_KEY_HOLDERS`, jalankan `dc up -d`, lalu Direktur membuat ulang kata sandi pemulihan |
| Pemegang kunci bertambah (Divisi IT: **belum diputuskan**) | Tambah email akunnya di `RECOVERY_KEY_HOLDERS`, jalankan `dc up -d`, lalu orangnya membuat kata sandi pemulihan (akun harus Admin) |
| Kunci data / server dicurigai bocor | Rotasi kunci data, ganti password database & `AUTH_SECRET`, periksa audit log & alarm |

---

## 12. Troubleshooting

| Gejala | Penyebab umum | Solusi |
|---|---|---|
| `dc up` berhenti dengan pesan "isi … di .env.production" | Variabel wajib masih kosong | Isi variabel yang disebut (§4.2) |
| `migrate` berstatus `exited (1)`, app tidak menyala | Kunci data salah format, atau password database salah | `dc logs migrate`, perbaiki `.env.production`, `dc up -d` |
| Log backup: "DITOLAK: baru N dari minimal 2 pemegang kunci" | Pemegang kunci belum membuat kata sandi pemulihan | Minta Pak Rudy & Pak Leonard mengerjakan §6.5 |
| Direktur tidak melihat kartu Kunci Pemulihan / "akses ditolak" | Email akunnya berbeda dengan `RECOVERY_KEY_HOLDERS` | Samakan, lalu `dc up -d` |
| Halaman Kunci Pemulihan: "File hilang — buat ulang" | Volume `recovery` hilang, atau email akun diganti | Direktur membuat ulang kata sandi pemulihan |
| Salinan backup: "NAS tidak terpasang" | NAS mati / kredensial salah / penanda hilang | Cek NAS, `ls /mnt/nas-oa/office-automation/.oa-offsite`, `sudo mount -a` |
| Salinan backup: "lebih tua dari 26 jam" | Service backup gagal atau mati | `dc logs backup`, `dc ps` |
| Browser: peringatan sertifikat | Sertifikat kedaluwarsa, atau CA internal belum dipasang di komputer karyawan | Perbarui sertifikat (§5) / pasang CA |
| nginx: 403 Forbidden | IP pengguna tidak termasuk `ALLOWED_SUBNETS` | Tambahkan subnet-nya, lalu `dc up -d` |
| nginx: 429 Too Many Requests | Batas laju request terlampaui | Tunggu sebentar; bila sering, laporkan ke tim pengembang |
| Email tidak terkirim | `worker` mati, atau SMTP tanpa TLS / kredensial salah | `dc logs worker`; cek status email di tabel `EmailLog` |
| Restore: "kunci data di .env.production tidak bisa membuka data" | Server memakai kunci lain dari backup | Hapus baris `DATA_ENCRYPTION_KEYS` & `DATA_INDEX_KEY` dari `.env.production`, lalu ulangi restore |
| `ss -tlnp` menampilkan port lain yang terbuka ke jaringan | Ada layanan lain terpasang di server | Hentikan / hapus layanan itu (§3.3) |

---

## 13. Gladi resik, go-live & serah terima

> **Singkatnya:** sebelum karyawan memakai aplikasi, seluruh isi dokumen ini **dilatih sekali di server percobaan**
> memakai data contoh, termasuk memulihkan server dari backup. Setelah lulus, aplikasi dipasang di server produksi,
> lalu diserahterimakan ke Tim IT.

### 13.1 Persiapan gladi resik
| Kebutuhan | Keterangan |
|---|---|
| **Server percobaan A** | Tempat memasang aplikasi seperti produksi (boleh VM, spesifikasi minimal §2.1) |
| **Server percobaan B** | Server kosong untuk uji pemulihan ke server baru |
| Data | **Hanya data contoh dari seed.** Jangan memakai data karyawan asli |
| Domain & sertifikat uji | Misalnya `oa-uji.artha-mitra.co.id`; sertifikat dari CA internal sudah cukup |
| Email | Akun SMTP uji, atau akun produksi |
| Tujuan salinan backup | Folder khusus di NAS (misalnya `office-automation-uji`) atau remote cloud uji |
| Pemegang kunci uji | `RECOVERY_KEY_HOLDERS` diisi email akun seed Rudy & Leonard di server uji; petugas IT memerankannya. Disarankan salah satu Direktur ikut pada uji pemulihan supaya terbiasa |
| Pencatatan | Berita acara gladi resik (§15.1) |

### 13.2 Daftar uji & hasil yang benar
Kerjakan berurutan. Tandai setiap uji Lulus atau Gagal di berita acara.

| No | Uji | Cara | Hasil yang benar |
|---|---|---|---|
| 1 | Pemasangan | Ikuti §3–§6 di server A | `dc ps`: semua sehat, `migrate` exited (0) |
| 2 | Pintu yang terbuka | `sudo ss -tlnp` di server A | Hanya 22, dan 80/443 di `BIND_IP` (§3.3); tidak ada 5432 atau 3000 |
| 3 | Database tertutup dari jaringan | Dari komputer kantor (PowerShell): `Test-NetConnection <BIND_IP> -Port 5432` | `TcpTestSucceeded : False` |
| 4 | Proxy tidak bisa ke database | `dc exec proxy sh -c 'wget -q -T 3 -O /dev/null http://db:5432 2>&1 \|\| true'` | Pesan `bad address 'db'` |
| 5 | Container terkunci | `docker inspect --format '{{.Name}} ro={{.HostConfig.ReadonlyRootfs}} cap={{.HostConfig.CapDrop}}' $(dc ps -q)` | Semua `ro=true` dan `cap=[ALL]` |
| 6 | HTTPS & header keamanan | Dari komputer karyawan: `curl -sI https://<APP_DOMAIN>/login` | Ada `strict-transport-security` dan `content-security-policy`; `http://` dialihkan ke `https://` |
| 7 | Jaringan tidak diizinkan | Buka aplikasi dari perangkat di luar `ALLOWED_SUBNETS` | 403 Forbidden |
| 8 | Login, ganti password, MFA | Login akun seed (Admin) | Wajib ganti password, lalu wajib daftar MFA; login berikutnya meminta kode 6 digit |
| 9 | Email & alarm keamanan | Ketik password salah 5× ke akun Admin | Semua Admin menerima email "[Alarm Keamanan] Login gagal beruntun …" |
| 10 | Upload & unduh file | Profil → Dokumen & Keluarga: unggah PDF, lalu buka lagi | File terbuka utuh |
| 11 | Kunci pemulihan | Dua akun pemegang kunci uji membuat kata sandi pemulihan (§6.5) | Halaman menampilkan "Backup berjalan"; email pemberitahuan masuk |
| 12 | Backup | `dc exec backup /bin/bash /scripts/backup.sh --now` | Tiga file dengan waktu yang sama di `backups/` |
| 13 | Salinan ke luar server | `sudo bash scripts/backup-offsite.sh` | Log `selesai`; tiga file ada di tujuan |
| 14 | Kata sandi salah ditolak | Di server B, jalankan restore lalu ketik kata sandi salah 3× | "Dibatalkan: kata sandi pemulihan salah 3 kali", tidak ada yang berubah |
| 15 | Pemulihan ke server kosong | Di server B, ikuti §10.3 memakai salinan dari NAS / cloud | Aplikasi berjalan; data, file, dan status kunci pemulihan sama dengan server A. **Catat lama prosesnya** |
| 16 | Mati listrik | Matikan paksa server A, lalu nyalakan lagi | Tanpa tindakan apa pun, dalam beberapa menit `dc ps` sehat dan aplikasi bisa dibuka |
| 17 | Update ulang | `dc up -d --build --force-recreate` di server A | `migrate` exited (0), data tetap utuh |
| 18 | Uji kata sandi di aplikasi | Pemegang kunci uji klik "Uji Kata Sandi" | "Kata sandi pemulihan benar." |

### 13.3 Setelah gladi resik
1. Lengkapi berita acara gladi resik (§15.1), termasuk temuan dan perbaikannya.
2. Temuan yang butuh perubahan kode dilaporkan ke tim pengembang; setelah diperbaiki, ulangi uji yang terkait.
3. **Hapus server percobaan beserta seluruh datanya**, termasuk salinan uji di NAS / cloud:
   ```bash
   dc down -v                     # hapus container DAN volume (database, upload, kunci uji)
   rm -rf backups .env.production
   ```
4. Kunci data, password, dan kata sandi pemulihan dari gladi resik **tidak boleh** dipakai lagi di produksi.

### 13.4 Go-live (server produksi)
Ulangi §3–§7 di server produksi dengan nilai-nilai produksi, lalu centang:
- ☐ Gladi resik lulus dan berita acaranya ditandatangani (§13.1–13.3)
- ☐ Server Ubuntu terpasang, update otomatis aktif, SSH hanya dengan kunci, zona waktu `Asia/Jakarta` (§3.1)
- ☐ Docker & Compose terpasang; `sudo ss -tlnp` hanya menampilkan 22 dan 80/443 (§3.2–3.3)
- ☐ `.env.production` terisi lengkap, `chmod 600`, kunci data produksi baru (bukan kunci dev / uji) (§4)
- ☐ Sertifikat HTTPS terpasang dan dipercaya browser karyawan (§5)
- ☐ `dc ps`: semua sehat, `migrate` exited (0) (§6.1)
- ☐ Seed dijalankan; akun awal sudah ganti password & MFA; email akun sudah email kantor (§6.2–6.4)
- ☐ `RECOVERY_KEY_HOLDERS` sama dengan email akun Pak Rudy & Pak Leonard (§6.4)
- ☐ Pak Rudy & Pak Leonard sudah membuat kata sandi pemulihan; halaman menampilkan "Backup berjalan" (§6.5)
- ☐ Backup pertama berhasil: tiga file dengan waktu yang sama (§6.6)
- ☐ Salinan ke NAS dan/atau cloud berhasil, cron terpasang, monitor ping aktif (§7)
- ☐ Lembar Data Instalasi terisi (§15.4)
- ☐ Karyawan diberi tahu alamat aplikasi dan cara login pertama

### 13.5 Serah terima ke Tim IT
| Yang diserahkan | Rinciannya |
|---|---|
| Dokumen | Dokumen ini (07), `docs/08-INVENTARIS-DATA.md`, `docs/09-DOKUMENTASI-TEKNIS.md` — versi Word & Markdown |
| Akses server | Akun SSH per petugas IT (kunci SSH masing-masing); petugas lama dicabut aksesnya |
| Rahasia | Tetap di `.env.production` di server. Akun SMTP / NAS / cloud disimpan di pengelola password Tim IT. Kunci data **tidak** disalin ke mana pun |
| Data instalasi | Lembar Data Instalasi (§15.4) |
| Jadwal | Pekerjaan rutin (§8), termasuk uji pemulihan tiap 3 bulan bersama Direktur |
| Kontak | Pemegang kunci (Pak Rudy & Pak Leonard), Admin aplikasi, dan tim pengembang |
| Berita acara | Berita acara serah terima (§15.3) ditandatangani kedua pihak |

### 13.6 Hasil gladi resik emulasi (2026-10-22)
Sebelum ada server sungguhan, tim pengembang menjalankan seluruh 18 uji §13.2 di **lingkungan emulasi**:
- dua "server" Linux berupa container *docker-in-docker* (Alpine, Docker 29) di satu komputer;
- jaringan kantor tiruan dengan subnet yang diizinkan dan yang tidak;
- server email Mailpit dengan TLS wajib;
- NAS berupa volume bersama;
- domain `oa-uji.artha-mitra.co.id` dengan sertifikat dari CA uji.

**Hasil: 18 dari 18 uji lulus.**

| Uji | Hasil penting |
|---|---|
| 1 | Semua container menyala berurutan; `migrate` exited (0); peringatan "0 dari 2 pemegang kunci" muncul sesuai §6.1 |
| 2–7 | Hanya 80/443 terbuka; 5432 & 3000 tertutup; proxy tidak bisa ke `db`; semua container `ro=true`, `cap=[ALL]`, `no-new-privileges`; HSTS + CSP ber-nonce; `http` → `https`; domain lain ditolak; subnet tak terdaftar 403 |
| 8–11 | Login pertama → wajib ganti password → wajib MFA; 13 email terkirim lewat TLS (pemberitahuan keamanan & alarm ke semua Admin); PDF diunggah & diunduh utuh (SHA-256 sama); kedua Direktur membuat kata sandi pemulihan → "Backup berjalan" |
| 12–13 | Tiga file backup dengan waktu yang sama; tersalin & dicek di NAS |
| 14 | Kata sandi salah 3× → "Dibatalkan"; server B tidak berubah sama sekali |
| 15 | Pemulihan ke server kosong dengan kata sandi Pak Leonard: **64 detik**; kunci data terisi otomatis dari titipan; jumlah data sama persis dengan server A; login dengan password & MFA dari server A berhasil; file upload sama persis |
| 16 | Server dimatikan paksa → pulih sendiri dalam ± 30 detik |
| 17–18 | Update ulang tanpa kehilangan data; uji kata sandi di aplikasi berhasil |

**Temuan & tindak lanjut**

| No | Temuan | Tindak lanjut |
|---|---|---|
| 1 | Backup manual (`dc exec backup … --now`) membuat file yang bisa ditulis semua user (666) | **Diperbaiki**: `scripts/backup.sh` menetapkan `umask 022`; hasil ulang 644 |
| 2 | Setelah update kode, container yang membaca skrip/konfigurasi dari folder project tetap memakai versi lama | **Diperbaiki di dokumen**: update memakai `--force-recreate` (§9) |
| 3 | Teks yang diketik sebelum prompt `Enter passphrase:` muncul masih tampil di layar | **Diperbaiki**: `restore.sh` dan §10.2 meminta menunggu prompt |
| 4 | Browser mencatat pelanggaran CSP `eval` dari pengecekan kemampuan library Zod | Kosmetik, tidak berbahaya: CSP memblokir sesuai desain dan semua fungsi tetap berjalan |

**Perbedaan dengan server sungguhan.** Gladi ulang di server asli tetap diperlukan untuk hal-hal ini:
- Ubuntu asli (bukan Alpine);
- SSH;
- sertifikat dan DNS kantor;
- SMTP dan NAS sebenarnya (mount SMB/NFS);
- cron;
- mati listrik fisik.

Bagian aplikasi, keamanan container, backup, dan pemulihan sudah terbukti di emulasi, jadi gladi di server asli diharapkan jauh lebih singkat.

---

## 14. Ringkasan perintah

```bash
cd /opt/office-automation
alias dc='docker compose -f docker-compose.prod.yml --env-file .env.production'

dc up -d --build                                        # nyalakan
dc up -d --build --force-recreate                       # perbarui setelah git pull (§9)
dc ps                                                   # status semua service
dc logs --tail=50 app                                   # log (app / worker / migrate / backup / proxy / db)
dc run --rm migrate npx prisma db seed                  # data awal (sekali)
dc exec backup /bin/bash /scripts/backup.sh --now       # backup sekarang
sudo bash scripts/backup-offsite.sh                     # salin backup ke NAS / cloud sekarang
bash scripts/restore.sh --db backups/db_….dump.age --uploads backups/uploads_….tar.gz.age   # pulihkan
dc exec app ls /app/storage/recovery                    # file kunci pemulihan
dc run --rm migrate npx tsx scripts/recovery-refresh.ts # perbarui titipan kunci data sekarang
sudo ss -tlnp                                           # pintu (port) yang terbuka di server
```

---

## 15. Lampiran: template berita acara & lembar data instalasi

Isi template di bawah dengan tangan atau salin ke dokumen terpisah, lalu simpan arsipnya bersama dokumen ini.
**Jangan menuliskan password, kunci data, atau kata sandi pemulihan di berita acara.**

### 15.1 Berita acara gladi resik
| Isian | |
|---|---|
| Tanggal & jam | |
| Server percobaan A / B | |
| Versi aplikasi (tag / commit) | |
| Petugas IT | |
| Saksi (Direktur / Admin) | |
| Hasil uji 1–18 (§13.2) | Lulus: … / Gagal: … (sebutkan nomornya) |
| Lama pemulihan ke server kosong (uji 15) | … menit |
| Temuan & tindak lanjut | |
| Server percobaan sudah dihapus (§13.3) | Ya / Belum |
| Tanda tangan | Petugas IT: ………   Saksi: ……… |

### 15.2 Berita acara pemulihan data
| Isian | |
|---|---|
| Tanggal & jam mulai – selesai | |
| Penyebab | (data terhapus / server rusak / uji berkala) |
| File backup yang dipakai | `db_…`, `uploads_…`, `kunci_…` (waktu yang sama) |
| Sumber salinan | Server / NAS / cloud / HDD |
| Pemegang kunci yang hadir | |
| Petugas IT | |
| Data yang perlu diinput ulang | (perubahan setelah waktu backup) |
| Hasil pemeriksaan (§10.3 langkah 6) | |
| Tanda tangan | Petugas IT: ………   Pemegang kunci: ……… |

### 15.3 Berita acara serah terima ke Tim IT
| Isian | |
|---|---|
| Tanggal | |
| Dari | Tim pengembang (Tim Intern: Attariq Shaquille & Nello Aurelius) |
| Kepada | Tim IT: ……… |
| Item diserahkan (§13.5) | ☐ Dokumen  ☐ Akses server  ☐ Akun SMTP/NAS/cloud  ☐ Lembar Data Instalasi  ☐ Jadwal rutin  ☐ Daftar kontak |
| Catatan | |
| Tanda tangan | Yang menyerahkan: ………   Yang menerima: ……… |

### 15.4 Lembar Data Instalasi (tanpa rahasia)
| Data | Isian |
|---|---|
| Lokasi fisik server | |
| Nama host & versi Ubuntu | |
| IP server (`BIND_IP`) | |
| Jaringan yang diizinkan (`ALLOWED_SUBNETS`) | |
| Domain aplikasi (`APP_DOMAIN`) | |
| Sertifikat: sumber & tanggal kedaluwarsa | |
| Folder project | `/opt/office-automation` |
| Versi aplikasi saat go-live | |
| Jadwal backup / salinan | `01:00` / `02:30` |
| Tujuan salinan: NAS (alamat & share) | |
| Tujuan salinan: cloud (remote rclone & bucket) | |
| Monitor (Uptime Kuma / healthchecks) | |
| Pemegang kunci (nama & email akun) | Pak Rudy: ………   Pak Leonard: ……… |
| Admin aplikasi | |
| Petugas IT utama & cadangan (kontak) | |

---

*Riwayat dokumen*
| Versi | Tanggal | Perubahan |
|---|---|---|
| 1.0 | 2026-10-21 | Versi pertama: persiapan server, konfigurasi, deploy, kunci pemulihan lewat aplikasi, salinan backup ke luar server (NAS / cloud / HDD), pekerjaan rutin, update, pemulihan, troubleshooting, checklist go-live |
| 1.1 | 2026-10-21 | Versi lengkap: firewall server (UFW) dihapus atas keputusan pemilik project, diganti §3.3 "Pintu yang terbuka di server"; bab 13 gladi resik rinci (18 uji), go-live, dan serah terima ke Tim IT; lampiran template berita acara & Lembar Data Instalasi |
| 1.2 | 2026-10-22 | Hasil gladi resik emulasi 18/18 lulus (§13.6); update memakai `--force-recreate` (§9); pemulihan: tunggu prompt `Enter passphrase:` (§10.2) |
