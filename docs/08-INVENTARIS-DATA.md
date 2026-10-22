# 08 — Inventaris Data Pribadi & Pengelolaan Kunci

Dokumen ini mencatat data pribadi yang disimpan aplikasi Office Automation:
- di mana data itu tersimpan;
- siapa yang boleh mengaksesnya;
- bagaimana data itu dilindungi;
- siapa yang memegang kuncinya.

Isinya adalah hasil hardening Tahap 4 (2026-10-20). Dokumen ini sekaligus menjadi catatan pemrosesan data pribadi
untuk UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.

## 1. Lapisan perlindungan

| Lapisan | Melindungi dari | Tempat di kode |
|---|---|---|
| Enkripsi kolom data pribadi (AES-256-GCM) | Isi database bocor: SQL injection, dump, akses langsung ke database | `src/lib/crypto/`, `src/lib/services/personal-data.ts` |
| Sidik jari NIK (HMAC-SHA256) | NIK harus tetap bisa dicek unik tanpa disimpan terbuka | `Employee.nikHash` |
| Enkripsi file upload | Volume/disk berisi scan KTP, KK, ijazah, dan surat sakit tersalin | `src/lib/crypto/file-encryption.ts`, `src/lib/storage/local.ts` |
| Backup terenkripsi `age` | File backup dicuri | `scripts/backup.sh`, `deploy/backup/` |
| Kunci pemulihan pemegang kunci | Kunci data hilang bersama server; backup dibuka orang yang tidak berhak | `src/lib/services/recovery-key.ts`, Setting → Kunci Pemulihan |
| Role database minimum | Aplikasi yang dibobol tidak bisa mengubah atau menghapus struktur database | `deploy/postgres/init-roles.sh` |
| Jaringan database internal + `pg_hba` | Database dijangkau dari luar atau dari container yang tidak berhak | `docker-compose.prod.yml`, `deploy/postgres/pg_hba.conf` |
| Hardening container | Membatasi dampak bila satu container dibobol | `docker-compose.prod.yml`, `Dockerfile` |
| Audit log | Jejak siapa mengubah atau membuka data | `AuditLog` (termasuk aksi `VIEW_PERSONAL_DATA`) |

## 2. Inventaris data pribadi

| Lokasi | Data | Perlindungan |
|---|---|---|
| `Employee` | NIK, No KK, NPWP, BPJS Ketenagakerjaan, BPJS Kesehatan, No HP, tanggal lahir, kontak darurat (nama, hubungan, No HP) | **Terenkripsi**. NIK punya sidik jari untuk cek unik. |
| `Employee` | Nama, email, NIP, jabatan, divisi, level, status | Tidak dienkripsi: dibutuhkan untuk login, daftar, pencarian, dan laporan |
| `Employee` | Alamat, tempat lahir, jenis kelamin, status pernikahan | Tidak dienkripsi (keputusan 2026-10-20). Tetap dilindungi role database, jaringan internal, dan backup terenkripsi. |
| `FamilyMember` | NIK & tanggal lahir anggota keluarga, termasuk anak | **Terenkripsi** |
| `FamilyMember` | Nama, hubungan | Tidak dienkripsi |
| `Candidate` | NIK, No HP kandidat | **Terenkripsi** |
| `Candidate` | Nama, email, posisi, catatan | Tidak dienkripsi |
| File upload (`storage/uploads`, volume `uploads`) | Scan KTP, KK, NPWP, BPJS, ijazah, sertifikat, surat nikah, akte anak, surat keterangan sakit | **Terenkripsi** per file |
| `HealthClaim.note`, `AttendanceAppeal.note` | Keterangan klaim kesehatan dan alasan appeal sakit (bisa memuat info medis) | Tidak dienkripsi (belum dipilih, 2026-10-20). Bisa dipertimbangkan lagi nanti. |
| `ProfileChangeRequest` (fitur lama) | Isi (payload) dan ringkasan perubahan data diri | **Terenkripsi** |
| `AuditLog.before/after` | Salinan data saat diubah | Kolom pribadi tersimpan dalam bentuk sandi. Baris audit sebelum Tahap 4 tidak diubah, karena audit tidak boleh diedit. Di dev tidak ada data pribadi di baris lama; produksi belum berjalan. |
| `User` | Email, password | Password disimpan sebagai hash argon2 |
| `EmailLog` | Alamat email tujuan, subjek | Tidak dienkripsi |
| Backup (`backups/*.age`) | Semua data di atas | **Terenkripsi** `age`, untuk gembok (kunci publik) para pemegang kunci |
| Folder kunci pemulihan (volume `recovery`, `backups/kunci_*.tar`) | Kunci pribadi pemegang kunci & titipan kunci data | **Terkunci** kata sandi pemulihan masing-masing pemegang kunci; kata sandinya tidak disimpan di mana pun |
| Log Postgres | User database, IP, waktu login, perintah DDL | Tidak memuat isi data |
| Terminal `npm run dev` | — | Argumen Server Action (password, NIK, dan sejenisnya) tidak dicetak (`logging.serverFunctions: false`) |

## 3. Hak akses

Keputusan pemilik project:

| Peran | Boleh melihat |
|---|---|
| **Admin** (HRD & Direktur: Bu Ika, Ko Rudy, Ko Leonard) | Semua data karyawan, termasuk data pribadi dan kesehatan, sesuai tugasnya. Tidak ada masking di layar (keputusan 2026-10-20). |
| **Approver** (Ko Darwin, Ko Yosep) | Data sendiri, plus pengajuan yang ditugaskan kepadanya beserta lampirannya |
| **Staf** | Hanya data sendiri |
| **Export & cetak** (export reimburse, biodata, rekap kesehatan, rekap reimburse) | Diri sendiri atau Admin. Export Excel tidak memuat NIK atau data identitas. |
| **Engineer / IT** | Tidak melihat data pribadi dari database, karena kolomnya terenkripsi. Data asli hanya bisa dibuka lewat aplikasi (dengan akun yang berhak) atau lewat alat `data:lihat` / `data:cari-nik` di server. Alat ini wajib diisi alasan dan nama, dan pemakaiannya tercatat di audit log. |

Karena Admin bisa melihat semua data, akun Admin menjadi target utama penyerang. Pengamannya adalah MFA untuk Admin
(Tahap 5, sudah dibuat 2026-10-20 — juga untuk Approver, lihat Tech Spec §9) dan alarm untuk akses besar-besaran (Tahap 6,
sudah dibuat 2026-10-21; salinan backup ke luar server: skrip & panduan sudah ada di `docs/07-DEPLOYMENT.md` §7,
tujuannya — NAS atau cloud — menunggu keputusan manajemen),
bukan pembatasan akses Admin.

## 4. Kunci dan pemegang kunci

**Pemegang kunci: Pak Rudy dan Pak Leonard** (Direktur), ditetapkan di `RECOVERY_KEY_HOLDERS` pada `.env.production`.
Mereka **tidak menjalankan perintah teknis apa pun** (keputusan 2026-10-21): cukup membuat **kata sandi pemulihan** di
aplikasi (Setting → Kunci Pemulihan) dan mengetiknya lagi bila server harus dipulihkan. Semua langkah teknis dikerjakan
petugas IT / admin server.

| Kunci | Fungsi | Tempat simpan | Siapa yang bisa membuka |
|---|---|---|---|
| `DATA_ENCRYPTION_KEYS`, `DATA_INDEX_KEY` (kunci data) | Mengunci & membuka kolom data pribadi dan file upload; sidik jari NIK | `.env.production` di server (`chmod 600`) | Server. Salinannya (`kunci-data.age`, titipan) dikunci untuk kunci pemulihan para pemegang kunci |
| Kunci pemulihan (kunci pribadi `age`, satu per pemegang kunci) | Membuka backup & titipan kunci data | File `kunci-pemulihan-<email>.age` di volume `recovery`, ikut setiap backup (`kunci_*.tar`) | Hanya pemiliknya, dengan **kata sandi pemulihan** yang ia buat sendiri. Kata sandi ini tidak disimpan di mana pun |
| Gembok (kunci publik `age`, `age1…`) | Mengunci backup & titipan | Tabel `RecoveryKey` dan `penerima.txt` (dibuat aplikasi) | Tidak rahasia |
| Password database (`oa`, `oa_app`, `oa_backup`), `AUTH_SECRET` | Akses database dan tanda tangan sesi login | `.env.production` | Admin server |

Cara kerjanya:
- Saat pemegang kunci menyimpan kata sandi pemulihan, aplikasi membuat kunci `age` khusus untuknya dan mengunci kunci
  itu dengan kata sandi tersebut (scrypt, format `age`). Aplikasi juga menulis ulang `penerima.txt` (gembok semua pemegang)
  dan titipan kunci data `kunci-data.age`. Semua Admin menerima email alarm setiap kali kunci pemulihan dibuat/diganti.
- Service `migrate` memperbarui titipan di setiap deploy, jadi rotasi kunci data atau perubahan daftar pemegang kunci
  langsung ikut. Pemegang kunci tidak perlu melakukan apa pun.
- File kunci pemulihan **sengaja tidak disimpan di database**: database yang bocor (mis. SQL injection) tidak memberi
  bahan untuk menebak kata sandi pemulihan.
- Backup & titipan dikunci untuk **semua** pemegang kunci. Masing-masing bisa membukanya sendiri. `scripts/backup.sh`
  menolak jalan bila pemegang yang sudah membuat kunci pemulihan kurang dari 2.
- Kata sandi pemulihan minimal 15 karakter dan berbeda dari password login. Uji kata sandi 5 kali salah dalam 15 menit →
  ditahan sementara. Dashboard mengingatkan pemegang kunci bila kuncinya belum dibuat atau > 3 bulan belum diuji.
- `RECOVERY_KEY_HOLDERS` harus sama persis dengan email login akun pemegang kunci. Nama file kunci memakai email itu:
  bila email akun pemegang kunci diganti, perbarui `RECOVERY_KEY_HOLDERS`, jalankan `dc up -d`, lalu pemegang kunci
  membuat ulang kata sandi pemulihan (halamannya akan menampilkan "File hilang — buat ulang").

> **Divisi IT sebagai pemegang kunci: belum diputuskan** (catatan pemilik project, 2026-10-20). Petugas IT saat ini
> hanya **pelaksana**: menjalankan langkah teknis, tetapi tidak bisa membuka backup sendirian. Kalau nanti diputuskan
> ikut memegang kunci: tambahkan email akun IT ke `RECOVERY_KEY_HOLDERS`, jalankan `dc up -d`, lalu orang IT itu membuat
> kata sandi pemulihan di Setting → Kunci Pemulihan (halaman Setting hanya untuk akun Admin).

**Kunci hilang berarti data terenkripsi hilang.** Tidak ada fitur "lupa password" untuk enkripsi. Bila semua pemegang
kunci lupa kata sandi pemulihannya *dan* server rusak, data pribadi terenkripsi tidak bisa dipulihkan. Karena itu ada
dua pemegang kunci dan pengingat uji setiap 3 bulan.

## 5. Prosedur

Perintah `docker compose` di bawah dijalankan di folder project di server, dengan awalan
`docker compose -f docker-compose.prod.yml --env-file .env.production` (ditulis `dc` di bawah).

> **Status 2026-10-22:**
> - Sudah dibuat: file produksi `docker-compose.prod.yml`, `deploy/`, `scripts/backup.sh`, `scripts/restore.sh`, dan
>   kunci pemulihan lewat aplikasi (menggantikan `scripts/keys-escrow.sh` yang dihapus).
> - Sudah diuji di dev: `backup.sh` sungguhan terhadap database dev (ditolak bila pemegang < 2; berhasil dengan 2), dan
>   file kunci buatan aplikasi dibuka dengan `age` 1.2.1 di image backup (kata sandi, titipan, dump, arsip upload).
> - **Gladi resik emulasi 2026-10-22: 18/18 uji lulus** (`docs/07-DEPLOYMENT.md` §13.6). Hasilnya:
>   - seluruh susunan produksi berjalan dalam mode terkunci (database, nginx, `migrate`, backup);
>   - backup `age` dan salinan ke NAS berhasil;
>   - `restore.sh` memulihkan server kosong dalam 64 detik dengan kata sandi pemulihan Direktur.
> - Gladi singkat tetap dijalankan di server Ubuntu sungguhan sebelum go-live, untuk SSH, DNS & sertifikat kantor,
>   SMTP & NAS asli, cron, dan mati listrik fisik.

### 5.1 Persiapan sebelum go-live
Langkah lengkap ada di `docs/07-DEPLOYMENT.md`. Ringkasnya:
1. **Petugas IT membuat kunci data** dengan `npm run keys:generate` (atau tanpa Node: `openssl rand -base64 32`, sekali
   untuk `DATA_ENCRYPTION_KEYS="v1:<hasil>"` dan sekali untuk `DATA_INDEX_KEY`).
2. **Isi `.env.production`:** kunci data, password database `POSTGRES_*`, dan
   `RECOVERY_KEY_HOLDERS="<email akun Pak Rudy>,<email akun Pak Leonard>"`. Lalu `chmod 600 .env.production`.
3. **Jalankan aplikasi:** `dc up -d --build`. Service `migrate` menjalankan migrasi, `data:encrypt`, lalu
   `recovery:refresh`. Kalau kunci salah, `migrate` gagal dan aplikasi tidak start.
4. **Pak Rudy dan Pak Leonard** masing-masing login, membuka **Setting → Kunci Pemulihan**, lalu membuat kata sandi
   pemulihan. Hanya itu yang perlu mereka lakukan. Status di halaman itu berubah menjadi "Backup berjalan" setelah
   keduanya selesai.
5. **Jalankan backup pertama** (`dc exec backup /bin/bash /scripts/backup.sh --now`) dan pastikan folder backup tersalin
   ke luar server (NAS/cloud, `docs/07-DEPLOYMENT.md`).
6. **Uji restore** sesuai 5.4 sebelum go-live, dengan salah satu Direktur hadir untuk mengetik kata sandi pemulihannya.

### 5.2 Rotasi kunci data
Rotasi dilakukan berkala, atau segera bila kunci dicurigai bocor.

1. Jalankan `node scripts/keys-generate.mjs --rotasi v2`. Taruh hasilnya **di depan**:
   `DATA_ENCRYPTION_KEYS="v2:…,v1:…"`.
2. Jalankan `dc up -d`. Service `migrate` berjalan lagi: `data:encrypt` mengunci ulang semua data dan file dengan `v2`,
   lalu `recovery:refresh` memperbarui titipan kunci data. Pemegang kunci tidak perlu melakukan apa pun.
3. **Kunci `v1` jangan dihapus**, karena audit log dan backup lama masih memakainya.

Rotasi `DATA_INDEX_KEY`:
1. `dc stop app worker`;
2. ganti nilainya;
3. `dc up -d` (`data:encrypt` menghitung ulang sidik jari NIK).

Bila kunci bocor, lakukan rotasi, lalu ganti juga password database dan `AUTH_SECRET` (semua orang harus login ulang),
dan periksa audit log.

### 5.3 Melihat data asli (engineer, hanya untuk keperluan sah)
```bash
dc run --rm migrate npx tsx scripts/data-view.ts --karyawan <email|id> --alasan "<alasan/tiket>" --oleh "<nama>"
dc run --rm migrate npx tsx scripts/data-find-nik.ts <NIK> --alasan "<alasan/tiket>" --oleh "<nama>"
```
- Setiap pemakaian tercatat di audit log dengan aksi `VIEW_PERSONAL_DATA`, beserta alasan, nama, dan host. NIK yang
  dicari tidak ikut dicatat.
- Di dev, perintah yang sama: `npm run data:lihat -- …` dan `npm run data:cari-nik -- …`.
- Kunci produksi jangan pernah disalin ke laptop. Membuka data asli hanya dilakukan di server.

### 5.4 Backup & restore
- **Backup otomatis** berjalan setiap hari pukul `BACKUP_TIME` ke `./backups/`, disimpan `BACKUP_KEEP_DAYS` hari. Isinya
  per waktu backup: `db_*.dump.age`, `uploads_*.tar.gz.age`, dan `kunci_*.tar` (salinan folder kunci pemulihan saat itu).
  Backup manual: `dc exec backup /bin/bash /scripts/backup.sh --now`.
- **Salin folder `backups/` ke luar server** (NAS / cloud) setiap hari. Filenya sudah terkunci, jadi aman disalin.
  Caranya: `docs/07-DEPLOYMENT.md`.
- **Restore** (petugas IT menjalankan, salah satu Direktur hadir):
  ```bash
  bash scripts/restore.sh --db backups/db_YYYYMMDD_HHMM.dump.age --uploads backups/uploads_YYYYMMDD_HHMM.tar.gz.age
  ```
  - Skrip meminta konfirmasi `PULIHKAN`, menampilkan daftar pemegang kunci di backup itu, lalu Direktur yang hadir
    **mengetik kata sandi pemulihannya** (tidak tampil di layar; maksimal 3 kali).
  - Skrip membuka titipan kunci data dan mengisi `.env.production` bila kunci datanya belum ada (server baru), lalu
    menghentikan app & worker, memulihkan database, memasang ulang role, memulihkan file upload & folder kunci
    pemulihan, memeriksa kunci data, dan menjalankan semua service.
  - Kunci pribadi yang sudah terbuka hanya disimpan sementara di memori (`/dev/shm`) dan dihapus saat skrip selesai.
- **Uji restore** minimal setiap 3 bulan ke server percobaan.

### 5.5 Bila kunci hilang
| Yang hilang | Akibat dan langkah |
|---|---|
| Satu pemegang kunci lupa kata sandi pemulihan | Backup masih bisa dibuka pemegang kunci lain. Yang lupa membuat kata sandi baru di Setting → Kunci Pemulihan ("Ganti"). Backup lama hanya bisa dibuka pemegang lain. |
| Kata sandi pemulihan dicurigai diketahui orang lain | Pemiliknya segera mengganti kata sandi di Setting → Kunci Pemulihan. Backup lama yang sudah tersalin tetap terkunci kata sandi lama — bila perlu, rotasi kunci data (5.2) |
| `.env.production` / server rusak | Pulihkan dengan `scripts/restore.sh` (5.4). Kunci data diambil otomatis dari titipan di backup |
| Semua pemegang kunci lupa kata sandi, server masih hidup | Aplikasi tetap berjalan. **Segera** buat kata sandi baru (Ganti) dan jalankan backup baru |
| Semua pemegang kunci lupa kata sandi **dan** server rusak | Data terenkripsi **tidak bisa dipulihkan** |

## 6. Aturan dev (higiene)
- **Dilarang** memakai data karyawan asli atau backup produksi di dev maupun laptop.
- **Kunci dev dibuat sendiri** dengan `npm run keys:generate`, dan tidak pernah memakai kunci produksi.
- **Data contoh:** `npm run dev:data-palsu` mengisi data diri palsu (NIK diawali `99`, HP `+62800…`) untuk karyawan yang
  datanya masih kosong; `--kosongkan` menghapusnya lagi. Skrip ini menolak jalan ke database selain localhost.
- **DB dev memakai role `oa_app`**, sama seperti produksi, supaya masalah hak akses sudah ketahuan di dev. Migrasi,
  seed, dan Studio memakai `MIGRATE_DATABASE_URL` (role `oa`).
- **`npm run lint` menolak** `$queryRawUnsafe` dan `$executeRawUnsafe`.
- **Developer baru / database lama**, setelah pull:
  1. `docker compose up -d`
  2. `npm run db:roles`
  3. lengkapi `.env` sesuai `.env.example`, termasuk kunci dari `npm run keys:generate`
  4. `npx prisma migrate deploy`
  5. `npx prisma generate`
  6. `npm run data:encrypt`

## 7. Batas perlindungan
- **Server aplikasi atau akun Admin dikuasai penyerang:** enkripsi tidak menolong, karena aplikasi membuka sandi untuk
  pengguna yang sah dan kunci ada di server. Penangkalnya MFA Admin (Tahap 5), alarm akses (Tahap 6), dan hardening server.
- **Data yang tidak dienkripsi** (lihat bagian 2) hanya dilindungi lapisan lain.
- **Disk server dicuri utuh** (bersama `.env.production`) ditangkal dengan enkripsi disk server (tahap deploy).
