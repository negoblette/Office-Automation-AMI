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
| Backup (`backups/*.age`) | Semua data di atas | **Terenkripsi** `age`, untuk kunci publik pemegang kunci |
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
sudah dibuat 2026-10-21; salinan backup ke NAS/cloud masih ditunda),
bukan pembatasan akses Admin.

## 4. Kunci dan pemegang kunci

| Kunci | Fungsi | Tempat simpan | Pemegang salinan |
|---|---|---|---|
| `DATA_ENCRYPTION_KEYS` | Mengunci dan membuka kolom data pribadi dan file upload | `.env.production` di server (`chmod 600`) | **Pak Rudy dan Pak Leonard**, lewat file `kunci-data-YYYYMMDD.age` hasil `scripts/keys-escrow.sh` |
| `DATA_INDEX_KEY` | Sidik jari NIK | Sama | Sama |
| Kunci **pribadi** `age` (`nama.agekey`) | Membuka backup dan file titipan kunci | **Tidak pernah di server.** Disimpan di USB/brankas dan pengelola password milik pemegangnya. | Pak Rudy memegang miliknya sendiri, Pak Leonard memegang miliknya sendiri |
| Kunci **publik** `age` (`age1…`) | Mengunci backup | `BACKUP_AGE_RECIPIENTS` di `.env.production` | Tidak rahasia |
| Password database (`oa`, `oa_app`, `oa_backup`), `AUTH_SECRET` | Akses database dan tanda tangan sesi login | `.env.production` | Admin server |

> **Divisi IT sebagai pemegang kunci: belum diputuskan** (catatan pemilik project, 2026-10-20). Kalau nanti
> diputuskan ikut memegang:
> 1. tambahkan kunci publik `age` milik IT ke `BACKUP_AGE_RECIPIENTS`;
> 2. jalankan ulang `scripts/keys-escrow.sh`;
> 3. backup berikutnya otomatis ikut bisa dibuka IT.

Backup dan file titipan kunci dikunci untuk **semua** kunci publik di `BACKUP_AGE_RECIPIENTS`. Masing-masing Direktur
bisa membukanya sendiri tanpa butuh Direktur lain. `scripts/backup.sh` menolak jalan bila penerimanya kurang dari 2.

**Kunci hilang berarti data terenkripsi hilang.** Tidak ada fitur "lupa password" untuk enkripsi. Karena itulah kunci
disimpan di dua orang.

## 5. Prosedur

Perintah `docker compose` di bawah dijalankan di folder project di server, dengan awalan
`docker compose -f docker-compose.prod.yml --env-file .env.production` (ditulis `dc` di bawah).

> **Status 2026-10-20:**
> - Sudah dibuat dan divalidasi (`docker compose config`): file produksi `docker-compose.prod.yml`, `deploy/`,
>   `scripts/backup.sh`, `scripts/restore.sh`, dan `scripts/keys-escrow.sh`.
> - **Belum** dijalankan penuh dalam gladi resik (ditunda atas keputusan pemilik project).
> - Jalankan gladi resik di server percobaan sebelum go-live. Perhatikan terutama:
>   - database dengan root filesystem read-only;
>   - nginx dengan tmpfs;
>   - service `migrate` yang berjalan sebagai user `node`;
>   - backup `age`;
>   - `restore.sh`.

### 5.1 Persiapan sebelum go-live
1. **Pak Rudy dan Pak Leonard masing-masing membuat kunci `age` sendiri**, di laptop masing-masing:
   - jalankan `age-keygen -o nama.agekey` (age tersedia untuk Windows, macOS, dan Linux);
   - simpan file `nama.agekey` di USB atau brankas, ditambah pengelola password;
   - kirim hanya baris `public key: age1…` ke admin server.
2. **Admin server membuat kunci data.** Pakai `npm run keys:generate`, atau tanpa Node: `openssl rand -base64 32`,
   sekali untuk `DATA_ENCRYPTION_KEYS="v1:<hasil>"` dan sekali untuk `DATA_INDEX_KEY`.
3. **Isi `.env.production`:**
   - kunci data;
   - password database `POSTGRES_*`;
   - `BACKUP_AGE_RECIPIENTS="age1…rudy,age1…leonard"`.

   Lalu jalankan `chmod 600 .env.production`.
4. **Jalankan aplikasi:** `dc up -d --build`. Service `migrate` menjalankan migrasi lalu `data:encrypt`. Kalau kunci
   salah, `migrate` gagal dan aplikasi tidak start.
5. **Titipkan kunci:** jalankan `scripts/keys-escrow.sh`. Serahkan `kunci-data-YYYYMMDD.age` ke Pak Rudy dan
   Pak Leonard, lalu hapus file itu dari server.
6. **Uji restore** sesuai 5.4 sebelum go-live.

### 5.2 Rotasi kunci data
Rotasi dilakukan berkala, atau segera bila kunci dicurigai bocor.

1. Jalankan `node scripts/keys-generate.mjs --rotasi v2`. Taruh hasilnya **di depan**:
   `DATA_ENCRYPTION_KEYS="v2:…,v1:…"`.
2. Jalankan `dc up -d`. Service `migrate` berjalan lagi dan `data:encrypt` mengunci ulang semua data dan file dengan `v2`.
3. Jalankan `scripts/keys-escrow.sh` lagi dan serahkan hasilnya ke kedua Direktur.
4. **Kunci `v1` jangan dihapus**, karena audit log dan backup lama masih memakainya.

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
- **Backup otomatis** berjalan setiap hari pukul `BACKUP_TIME` ke `./backups/` (`db_*.dump.age`,
  `uploads_*.tar.gz.age`), disimpan `BACKUP_KEEP_DAYS` hari. Backup manual: `dc exec backup /bin/bash /scripts/backup.sh --now`.
- **Salin folder `backups/` ke tempat lain** (disk atau NAS lain). Filenya sudah terenkripsi, jadi aman disalin.
- **Restore:** salah satu Direktur membawa file kunci pribadinya, lalu jalankan
  ```bash
  scripts/restore.sh --kunci /media/usb/rudy.agekey --db backups/db_YYYYMMDD_HHMM.dump.age \
                     --uploads backups/uploads_YYYYMMDD_HHMM.tar.gz.age
  ```
  - Skrip meminta konfirmasi `PULIHKAN`, lalu menghentikan app dan worker, memulihkan database, memasang ulang role,
    memulihkan file, memeriksa kunci data, dan menjalankan lagi app dan worker.
  - `.env.production` harus memuat kunci data yang sama dengan saat backup dibuat, termasuk kunci lama.
- **Uji restore** minimal setiap 3 bulan ke server percobaan.

### 5.5 Bila kunci hilang
| Yang hilang | Akibat dan langkah |
|---|---|
| Kunci `age` salah satu Direktur | Backup masih bisa dibuka dengan kunci Direktur lain. Buat kunci baru, ganti kunci publiknya di `BACKUP_AGE_RECIPIENTS`, lalu escrow ulang. |
| `.env.production` / server rusak | Ambil `DATA_ENCRYPTION_KEYS` dan `DATA_INDEX_KEY` dari file titipan: `age -d -i nama.agekey kunci-data-….age` |
| Semua salinan kunci data | Data terenkripsi **tidak bisa dipulihkan** |

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
