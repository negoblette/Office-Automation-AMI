# 09 — Dokumentasi Teknis Office Automation System

| | |
|---|---|
| **Sistem** | Office Automation System — PT Artha Mitra Interdata |
| **Disusun oleh** | Tim Intern: **Attariq Shaquille** dan **Nello Aurelius** |
| **Versi dokumen** | 1.5 (2026-10-22) |
| **Pembaca** | Tim IT / infrastruktur, developer baru, reviewer keamanan, pemilik project |
| **Kerangka** | Mengikuti pola *arc42* (standar dokumentasi arsitektur perangkat lunak) |
| **Sumber kebenaran** | Kode di repository. Bila dokumen ini berbeda dengan kode, kode yang benar — perbarui dokumen ini. |

Project Office Automation System ini dibangun oleh **tim intern PT Artha Mitra Interdata** yang beranggotakan
**Attariq Shaquille** dan **Nello Aurelius**. Dokumen ini kami tulis supaya siapa pun yang meneruskan, memasang, atau
merawat aplikasi ini — terutama Tim IT — bisa memahaminya tanpa harus menebak-nebak isi kodenya.

Kami sengaja menulis dengan bahasa sehari-hari. Istilah teknis tetap dipakai (karena memang itu namanya), tapi selalu
kami jelaskan artinya. Kalau Anda hanya punya waktu sebentar, baca kotak **"Singkatnya"** di awal setiap bagian.

**Cara membaca kotak-kotak di dokumen ini**

| Kotak | Artinya |
|---|---|
| **Singkatnya** | Ringkasan satu-dua kalimat untuk pembaca yang terburu-buru |
| **Contoh** | Ilustrasi kejadian nyata supaya aturan lebih mudah dibayangkan |
| **Penting** | Hal yang wajib diperhatikan; kalau dilanggar, biasanya ada yang rusak |
| **Kenapa begini?** | Alasan di balik sebuah keputusan desain |

**Dokumen terkait**

| Dokumen | Isi |
|---|---|
| `CLAUDE.md` | Aturan kerja & ringkasan aturan bisnis terbaru (paling mutakhir) |
| `docs/01-URD.md` | Kebutuhan user, ID requirement (EMP-01, RMB-03, …), Open Issue |
| `docs/02-TECH-SPEC.md` | Spesifikasi teknis: validasi, approval engine, keamanan (§9) |
| `docs/03-ARSITEKTUR.md` | Diagram arsitektur ringkas |
| `docs/04-MAPPING-MENU.md` | Menu & hak akses per role |
| `docs/05-TAHAPAN.md`, `docs/PLAN.md` | Urutan & checklist pengerjaan fase |
| `docs/06-DESAIN-UI.md` | Acuan tampilan |
| `docs/07-DEPLOYMENT.md` | Panduan memasang di server, salinan backup ke luar server, pemulihan, pekerjaan rutin |
| `docs/08-INVENTARIS-DATA.md` | Data pribadi, enkripsi, pemegang kunci, backup & restore |

---

## Daftar isi
1. Kenalan dengan aplikasi ini
2. Aturan main pengembangan
3. Gambaran besar sistem
4. Teknologi yang dipakai
5. Cara kode disusun
6. Peta folder project
7. Pengguna & hak akses
8. Modul satu per satu
9. Approval engine
10. Database
11. Pekerjaan latar belakang (worker)
12. Email & notifikasi
13. Perjalanan sebuah file
14. Keamanan
15. Pengelolaan & penitipan kunci enkripsi
16. Konfigurasi (environment variable)
17. Menyiapkan komputer developer
18. Testing & standar kualitas
19. Deployment & operasional
20. Panduan menambah fitur
21. Troubleshooting & tanya-jawab
22. Catatan keputusan arsitektur (ADR)
23. Status, risiko & pekerjaan lanjutan
24. Glosarium

---

## 1. Kenalan dengan aplikasi ini

> **Singkatnya:** Office Automation System adalah aplikasi web internal untuk mengurus data karyawan dan semua
> urusan administrasi kantor — data diri, absensi, cuti, reimburse, klaim kesehatan, sampai biaya project — lengkap
> dengan persetujuan berjenjang dan email otomatis.

### 1.1 Latar belakang
Sebelum aplikasi ini ada, data karyawan dan pengajuan tersebar di berkas, spreadsheet, dan pesan chat. Akibatnya:
- sulit tahu sisa cuti atau sisa plafon kesehatan seseorang tanpa menghitung ulang manual;
- pengajuan reimburse bisa "nyangkut" di satu orang tanpa ada yang sadar;
- dokumen penting (KTP, ijazah, sertifikat) tidak terkumpul di satu tempat, dan masa berlakunya sering terlewat;
- tidak ada catatan siapa menyetujui apa dan kapan.

Aplikasi ini menyatukan semuanya di satu tempat, menghitung angka-angkanya secara otomatis, dan mencatat setiap
perubahan.

### 1.2 Apa yang bisa dilakukan aplikasi ini
| Area | Yang bisa dilakukan |
|---|---|
| **Sumber Daya Manusia** | Menyimpan data karyawan & dokumennya, keluarga, sertifikat & ijazah, kandidat (bisa langsung dijadikan karyawan), resign & rehire, aset kantor yang dipegang karyawan, cetak biodata |
| **Absensi** | Clock in / clock out, rekap kehadiran, koreksi oleh Admin, appeal bila tidak hadir karena sakit atau kunjungan |
| **Pengajuan** | Reimburse, cuti, klaim kesehatan, expense project, verifikasi sertifikat — semuanya dengan nomor dokumen resmi |
| **Persetujuan** | Alur bertingkat per modul & divisi, approver bisa mengoreksi, menolak (lalu pemohon merevisi), atau membatalkan persetujuan |
| **Keuangan** | Plafon & jadwal pembayaran kesehatan, total biaya per project, export Excel & cetak rekap |
| **Sistem** | Pengaturan user & role, alur approval, divisi, jatah cuti, plafon, master data, pengingat H-30, lonceng notifikasi |

### 1.3 Sehari bersama aplikasi ini
Supaya lebih terbayang, begini contoh pemakaian dalam satu hari:

> **Contoh:** Pagi hari **Andi** (staf Engineer) membuka aplikasi dari laptop kantor, lalu menekan **Clock in**.
> Siang harinya ia mengajukan **reimburse** biaya makan dengan klien. Begitu diajukan, aplikasi memberi nomor
> `RMB/2026/10/0007` dan mengirim email ke **Ko Yosep** (approver level 1 divisi Engineer). Ko Yosep membuka email,
> mengklik link, lalu **menyetujui**. Pengajuan otomatis naik ke **Ko Rudy** (level 2). Setelah Ko Rudy menyetujui,
> Andi dan semua Admin mendapat email bahwa reimburse sudah disetujui final. Sore hari Andi menekan **Clock out**.
> Semua langkah tadi tercatat di audit log lengkap dengan jam dan alamat IP-nya.

### 1.4 Tujuan kualitas
Saat membuat keputusan teknis, kami memegang urutan prioritas ini:
1. **Keamanan & kerahasiaan data pribadi.** Data karyawan (NIK, KK, NPWP, nomor HP, dan lain-lain) termasuk data
   pribadi menurut UU PDP, jadi harus dijaga sungguh-sungguh (lihat §14).
2. **Angka harus benar.** Saldo cuti, sisa plafon, dan nomor dokumen tidak boleh salah atau ganda. Ini dijaga dengan
   test otomatis dan transaksi database.
3. **Mudah dirawat.** Aturan bisnis dipisahkan dari tampilan, sehingga bisa diubah dan dites tanpa membuka browser.
4. **Mudah dipasang di server kantor.** Semua bagian berjalan di dalam container Docker.

---

## 2. Aturan main pengembangan

> **Singkatnya:** ini "aturan rumah" yang dipegang selama aplikasi dikembangkan. Tolong tetap dipatuhi oleh siapa
> pun yang meneruskan project ini, supaya kodenya tetap rapi dan aman.

| Aturan | Isinya | Kenapa |
|---|---|---|
| Bahasa | Kode (nama variabel, fungsi, tabel) bahasa **Inggris**; teks yang dilihat pengguna (UI, pesan, email) bahasa **Indonesia** | Kode mengikuti kebiasaan programmer di seluruh dunia; tampilan mengikuti pemakai |
| Zona waktu | Semua tanggal dihitung dalam **WIB (Asia/Jakarta)** | Supaya tanggal tidak "bergeser" sehari karena perbedaan zona waktu server |
| Uang | Rupiah tanpa desimal, disimpan sebagai bilangan bulat besar (`BigInt`), tampil `Rp 1.291.825` | Menghindari kesalahan pembulatan |
| Hapus data | **Soft delete**: data ditandai terhapus (`deletedAt`), tidak benar-benar dibuang | Data tidak hilang karena salah klik, dan jejaknya tetap ada |
| Library baru | Tidak menambah library besar (Redis, state manager global, UI kit lain) tanpa persetujuan pemilik project | Menjaga aplikasi tetap ringan dan mudah dirawat |
| Di luar scope | Tools tes skill karyawan, fitur mutasi/tracking mutasi, modul laporan | Disepakati tidak dibuat pada versi ini |
| Requirement belum jelas | Ditandai `// TODO(OI-xx)` sesuai tabel Open Issue di `docs/01-URD.md`; **jangan mengarang aturan baru**, tanyakan dulu | Aturan bisnis adalah keputusan perusahaan, bukan developer |
| Cara kerja | Satu fase per sesi; setiap selesai, `lint`, `typecheck`, dan `test` harus lulus; pemilik project yang review & commit | Perubahan selalu terkontrol |

---

## 3. Gambaran besar sistem

> **Singkatnya:** karyawan membuka aplikasi lewat browser di jaringan kantor. Aplikasi menyimpan data di database
> PostgreSQL, menyimpan file di disk dalam keadaan terkunci, dan mengirim email lewat server email kantor.

### 3.1 Diagram
```
            Karyawan / Admin / Approver (browser, jaringan kantor / VPN)
                                   │ HTTPS
                     ┌─────────────▼─────────────┐
                     │  Reverse proxy (nginx)     │  TLS, HSTS, rate limit, allowlist subnet
                     └─────────────┬─────────────┘
                                   │ HTTP internal
   ┌───────────────────────────────▼───────────────────────────────┐
   │              Aplikasi web (Next.js, container "app")           │
   │   Halaman (React) · Server Actions · Route API · Service layer │
   └───────┬───────────────────────┬──────────────────────┬────────┘
           │ SQL (role oa_app)      │ baca/tulis file       │ masuk antrian
   ┌───────▼────────┐      ┌────────▼────────┐    ┌────────▼─────────┐
   │ PostgreSQL 17  │      │ Storage upload   │    │ Worker (pg-boss) │── SMTP ──► Server email
   │ data + antrian │◄─────│ (terenkripsi)    │    │ email, cron job  │
   └───────┬────────┘      └────────┬────────┘    └──────────────────┘
           │ pg_dump (oa_backup)     │ tar
   ┌───────▼─────────────────────────▼───────┐
   │ Backup harian terenkripsi (age)          │──► disimpan di ./backups, disalin ke NAS/cloud
   └──────────────────────────────────────────┘
```

### 3.2 Komponen dengan perumpamaan sederhana
Bayangkan aplikasi ini sebagai sebuah kantor kecil:

| Komponen | Perumpamaan | Tugas sebenarnya |
|---|---|---|
| **Reverse proxy (nginx)** | Satpam di gerbang | Hanya membukakan pintu untuk jaringan kantor, memakai HTTPS, membatasi orang yang mencoba masuk berkali-kali |
| **Aplikasi web (Next.js)** | Meja layanan | Menampilkan halaman, menerima isian form, menjalankan aturan bisnis |
| **Database (PostgreSQL)** | Lemari arsip | Menyimpan semua data: karyawan, pengajuan, approval, audit, sekaligus antrian pekerjaan |
| **Storage upload** | Gudang berkas | Menyimpan file (scan KTP, ijazah, surat sakit) dalam keadaan **terkunci** (terenkripsi) |
| **Worker** | Kurir & petugas jadwal | Mengirim email dan menjalankan tugas rutin harian (pengingat, rollover cuti, dan lain-lain) |
| **Server email (SMTP)** | Kantor pos | Meneruskan email ke kotak masuk karyawan |
| **Backup** | Brankas cadangan | Setiap malam menyalin isi database & file, lalu menguncinya supaya hanya pemegang kunci yang bisa membuka |

### 3.3 Siapa saja yang berinteraksi dengan sistem
| Pihak | Interaksi |
|---|---|
| Karyawan (Staf) | Mengisi data diri, absensi, mengajukan reimburse/cuti/klaim |
| Approver | Menyetujui, menolak, atau mengoreksi pengajuan yang ditugaskan kepadanya |
| Admin (HRD & Direktur) | Mengelola semua data dan pengaturan |
| Server SMTP kantor | Menerima email dari worker (wajib TLS di produksi) |
| Aplikasi authenticator di HP | Google/Microsoft Authenticator, menghasilkan kode MFA untuk semua karyawan |

---

## 4. Teknologi yang dipakai

> **Singkatnya:** seluruh aplikasi ditulis dengan TypeScript memakai Next.js, datanya di PostgreSQL. Antrian
> pekerjaan juga disimpan di PostgreSQL, jadi tidak perlu server tambahan seperti Redis. Semuanya dibungkus Docker.

| Kebutuhan | Teknologi (versi) | Penjelasan sederhana |
|---|---|---|
| Mesin penjalan | Node.js 24 (image `node:24.21.0-bookworm-slim`) | "Mesin" yang menjalankan kode JavaScript/TypeScript di server |
| Kerangka aplikasi | **Next.js 16.3.8** (App Router), React 19.2.8 | Satu project untuk tampilan sekaligus backend; form dikirim lewat *Server Actions* |
| Bahasa | TypeScript 6 (mode strict) | JavaScript yang "dicek tipenya", sehingga banyak kesalahan ketahuan sebelum aplikasi jalan |
| Database | **PostgreSQL 17.11** | Database yang andal untuk transaksi keuangan & data penting |
| Penghubung database | **Prisma 7.10** (`prisma-client` + `@prisma/adapter-pg`) | Menulis query dengan kode TypeScript yang aman, plus mengelola perubahan struktur tabel (migrasi) |
| Login | **Auth.js v5** (next-auth beta.32), email + password, sesi JWT | Mengurus login dan sesi tanpa layanan luar |
| Penyimpan password | argon2 | Password tidak disimpan apa adanya, melainkan diubah jadi "sidik jari" yang tidak bisa dibalik |
| MFA | `otpauth` (TOTP RFC 6238) + `qrcode` | Kode 6 digit dari aplikasi authenticator |
| Validasi isian | **Zod 4** + React Hook Form | Satu aturan validasi dipakai di browser dan di server |
| Tampilan | Tailwind CSS 4 + shadcn/ui (style `base-nova`, berbasis **Base UI**) | Komponen tampilan yang seragam dan ramah aksesibilitas |
| Tabel data | **TanStack Table v9** lewat `components/table/data-table.tsx` | Tabel yang bisa diurutkan, dicari, dan dibagi per halaman |
| Antrian & jadwal | **pg-boss 12** | Antrian pekerjaan (email, job harian) yang tersimpan di PostgreSQL |
| Email | Nodemailer 10 + React Email | Template email ditulis seperti komponen tampilan |
| Tanggal | date-fns + date-fns-tz | Perhitungan tanggal dalam WIB |
| Excel | exceljs | Export rekap reimburse ke Excel |
| Test otomatis | **Vitest 5** (proyek `unit` dan `db`) | Menjalankan ratusan pengecekan otomatis |
| Kontainer | Docker, Docker Compose; nginx 1.30.6 | Membungkus semua bagian supaya mudah dipasang di server |
| Backup | `pg_dump` + **age** | Backup dikunci; hanya pemegang kunci yang bisa membuka |
| Kunci pemulihan | **age-encryption** (versi TypeScript dari pembuat age) | Aplikasi membuat kunci pemulihan Direktur & menguncinya dengan kata sandi pemulihan (Bab 15) |

> **Penting:** Next.js 16 dan Prisma 7 cukup berbeda dari versi lama yang banyak dibahas di internet. Panduan resmi
> versi yang dipakai ada di `node_modules/next/dist/docs/`. Dua hal yang paling sering membuat bingung: Prisma 7
> **tidak** membuat ulang client secara otomatis (wajib `npx prisma generate` setelah migrasi), dan "middleware"
> di Next.js 16 bernama `src/proxy.ts`.

---

## 5. Cara kode disusun

> **Singkatnya:** tampilan hanya bertugas menampilkan. Semua aturan bisnis ada di folder `src/lib/services`,
> sehingga bisa dites tanpa browser. Setiap perubahan data selalu lewat *Server Action* yang mengikuti 5 langkah yang
> sama.

### 5.1 Lapisan aplikasi (perumpamaan restoran)
| Lapisan | Perumpamaan | Lokasi | Tugas | Yang tidak boleh |
|---|---|---|---|---|
| Presentasi | Pelayan | `src/app/**/page.tsx`, `src/components` | Menampilkan halaman, form, tabel | Berisi aturan bisnis |
| Aplikasi | Kasir | `src/app/**/actions.ts`, `src/app/api/**/route.ts` | Memeriksa siapa yang datang, memvalidasi pesanan, meneruskan ke dapur | Mengolah sendiri / query rumit |
| Domain (service) | Dapur | `src/lib/services/` | Aturan bisnis murni; menerima koneksi database sebagai parameter | Bergantung pada Next.js |
| Data | Gudang bahan | `src/lib/db.ts`, `src/lib/storage/`, `src/lib/crypto/` | Prisma client, penyimpanan file, enkripsi | — |
| Latar belakang | Kurir | `worker/` | Email, pengingat, job harian | — |

> **Kenapa begini?** Kalau aturan bisnis (misalnya cara menghitung sisa cuti) bercampur dengan kode tampilan,
> setiap perubahan tampilan berisiko merusak perhitungan. Dengan memisahkan "dapur" dari "pelayan", aturan bisnis
> bisa dites ratusan kali per menit tanpa membuka browser.

### 5.2 Lima langkah wajib setiap Server Action
```
1. Cek sesi & role     → requireUser() / requireApprover() / requireAdmin()
2. Validasi input      → schema Zod (src/lib/validators/*)
3. Panggil service     → src/lib/services/* (di dalam prisma.$transaction bila >1 tabel)
4. Tulis audit log     → logAudit(...)  (biasanya di dalam service)
5. Segarkan halaman    → revalidatePath(...)
```
Email **tidak pernah** dikirim langsung dari sebuah request. Service mengembalikan daftar notifikasi, lalu action
memasukkannya ke antrian **setelah** transaksi berhasil. Kalau pengiriman email gagal, data pengajuan tetap aman dan
email dicoba ulang oleh worker.

### 5.3 Contoh alur lengkap: karyawan mengajukan reimburse
```
Form (browser) ─► Server Action submit reimburse
  ├─ requireUser()                               siapa yang login
  ├─ reimbursementSchema.parse(values)           validasi + normalisasi
  └─ prisma.$transaction:
       ├─ nextDocumentNumber(tx, "RMB")           → RMB/2026/10/0007 (row lock, tidak ganda)
       ├─ simpan Reimbursement + item (status PENDING, total dihitung server)
       ├─ buildApproval(tx, …)                     → ApprovalRequest + step sesuai alur divisi
       └─ logAudit(...)
  └─ setelah commit: enqueueApprovalNotifications → email ke approver level 1
Worker ─► ambil job email.send ─► kirim lewat SMTP ─► EmailLog = SENT
```
Perhatikan bahwa nomor dokumen, data reimburse, dan approval dibuat **dalam satu transaksi**. Artinya: semuanya
berhasil bersama, atau gagal bersama. Tidak mungkin ada nomor dokumen yang "terpakai" tanpa pengajuannya.

### 5.4 Prinsip desain yang harus dijaga
- **Otorisasi selalu dicek di server.** Menyembunyikan menu hanyalah kenyamanan tampilan, bukan pengamanan. Setiap
  halaman dan action memanggil guard.
- **Staf hanya boleh menyentuh data miliknya** (`employeeId` miliknya sendiri). Dicek di service/query.
- **Transaksi** untuk setiap operasi yang mengubah lebih dari satu tabel.
- **Snapshot approval:** saat pengajuan dibuat, alurnya "difoto" dan disimpan bersama pengajuan. Jadi kalau Admin
  mengubah alur approval besok, pengajuan yang sedang berjalan tidak ikut kacau.
- **Tidak ada BigInt ke browser:** nominal uang dikonversi dulu di server sebelum dikirim ke tampilan.
- **Data pribadi terenkripsi** dibuka dan dikunci di lapisan service (`services/personal-data.ts`), sehingga
  tampilan dan logika bisnis tetap memakai nilai biasa.

---

## 6. Peta folder project

> **Singkatnya:** kode tampilan ada di `src/app` dan `src/components`, aturan bisnis di `src/lib/services`, struktur
> database di `prisma/`, dan semua yang berhubungan dengan server produksi ada di `deploy/`, `scripts/`, dan file
> Docker.

```
src/
  app/
    (auth)/            login, ganti-password, mfa — halaman tanpa sidebar
    (main)/            halaman utama dengan sidebar (wajib login): dashboard, absensi, profil, karyawan, kandidat,
                       project, reimburse, cuti, kesehatan, approval, setting, inventory (ditunda), akses-ditolak
    (print)/           halaman cetak: biodata/[employeeId], cetak/reimburse, cetak/kesehatan
    api/               auth/[...nextauth], files/[key] (unduh file), export/reimburse (Excel), health (cek kesehatan)
    layout.tsx         layout root (CSP nonce lewat connection())
  components/          ui/ (shadcn), form/, table/, layout/ (sidebar, topbar, nav-config), shared/, employee/,
                       attendance/, print/
  lib/
    auth/              config Auth.js (config.ts), provider & login (index.ts), guard (guards.ts)
    services/          ±50 service aturan bisnis (+ test *.test.ts / *.db.test.ts)
    validators/        schema Zod per modul (common.ts = aturan format NIK/HP/NPWP/dll.)
    crypto/            kunci & enkripsi data pribadi (keys.ts, field-encryption.ts, file-encryption.ts)
    security/          csp.ts (Content Security Policy)
    storage/           LocalStorage (terenkripsi), validasi upload (magic bytes, PDF aktif)
    mail/              antrian email, template React Email, kirim SMTP
    db.ts              Prisma client tunggal
    format.ts          format Rupiah, tanggal, telepon, NPWP
    labels.ts, roles.ts, features.ts, password-policy.ts, request-meta.ts, …
  generated/prisma/    hasil `prisma generate` — JANGAN diedit, tidak di-commit
  proxy.ts             "middleware" Next.js 16: cek login cepat + header CSP
  test/                helper test (db.ts, seed.ts, entities.ts, uploads.ts)
worker/index.ts        proses worker pg-boss
prisma/                schema.prisma, migrations/ (30 migrasi), seed.ts, seed-lib.ts
scripts/               backup.sh, backup-offsite.sh, restore.sh, recovery-refresh.ts,
                       data-encrypt.ts, data-view.ts, data-find-nik.ts,
                       dev-fake-data.ts, keys-generate.mjs
deploy/                nginx/ (reverse proxy), postgres/ (init-roles.sh, pg_hba.conf), backup/ (image backup + age)
docs/                  dokumen project
Dockerfile             image app / worker / migrate
docker-compose.yml     dev: PostgreSQL + Mailpit
docker-compose.prod.yml produksi: db, migrate, app, worker, proxy, backup
```

### 6.1 "Kalau mau mengubah ini, buka file itu"
| Ingin mengubah… | Mulai dari |
|---|---|
| Aturan format NIK, HP, NPWP, nama, nominal | `src/lib/validators/common.ts` |
| Cara menghitung saldo cuti | `src/lib/leave.ts`, `src/lib/services/leave.ts`, `leave-balance.ts` |
| Siapa menyetujui pengajuan | Menu Setting → Approval Flow (data), mesin di `src/lib/services/approval.ts` |
| Efek setelah pengajuan disetujui | `src/lib/services/approval-effects.ts` |
| Isi & tampilan email | `src/lib/mail/templates/` |
| Menu sidebar | `src/components/layout/nav-config.ts` |
| Jadwal job harian | `worker/index.ts` |
| Kolom tabel database | `prisma/schema.prisma` (+ buat migrasi) |
| Kebijakan password | `src/lib/password-policy.ts` |
| Domain luar yang boleh dimuat browser (CSP) | `src/lib/security/csp.ts` |

---

## 7. Pengguna & hak akses

> **Singkatnya:** ada tiga role. **Admin** boleh semuanya. **Approver** sama seperti staf, ditambah bisa menyetujui
> pengajuan. **Staf** hanya bisa melihat dan mengubah datanya sendiri. Siapa yang menyetujui sebuah pengajuan
> ditentukan oleh **Approval Flow**, bukan oleh role saja.

### 7.1 Tiga role
| Role | Siapa (data awal) | Hak |
|---|---|---|
| `ADMIN` | Bu Ika (HR & Finance), Ko Rudy & Ko Leonard (Direktur) | Semua data dan semua pengaturan. Bisa melihat data pribadi semua karyawan, sesuai tugasnya (keputusan pemilik project: tanpa masking di layar) |
| `APPROVER` | Ko Darwin (Sales), Ko Yosep (Engineer) | Data sendiri + halaman Approval untuk pengajuan yang ditugaskan kepadanya |
| `STAFF` | Karyawan lain | Hanya data sendiri |

> **Penting:** semua akun **wajib** memakai MFA (kode dari aplikasi authenticator di HP). Awalnya hanya Admin dan
> Approver, yang memegang akses paling luas; sejak 2026-10-30 Staf juga wajib, karena akun Staf menyimpan data
> pribadinya sendiri (NIK, rekening, keluarga) dan bisa mengajukan reimburse.

### 7.2 Penjaga pintu di kode (guard)
| Guard | Dipakai di | Fungsinya |
|---|---|---|
| `requireUser()` | Semua halaman & action yang butuh login | Wajib login, akun aktif, sudah ganti password awal, dan sudah daftar MFA |
| `requireApprover()` | Halaman & aksi Approval | Hanya Admin atau Approver |
| `requireAdmin()` | Halaman karyawan, kandidat, setting, dll. | Hanya Admin; selain itu diarahkan ke halaman "Akses ditolak" |
| `getReadyUser()` | Route API (unduh file, export) | Seperti `requireUser`, tapi mengembalikan 401 alih-alih mengalihkan halaman |

### 7.3 Halaman & siapa yang boleh membuka
| Halaman | Route | Admin | Approver | Staf |
|---|---|---|---|---|
| Login, ganti password, MFA | `/login`, `/ganti-password`, `/mfa` | ✔ | ✔ | ✔ |
| Dashboard | `/dashboard` | Ringkasan semua + antrian | Milik sendiri + antrian | Milik sendiri |
| Absensi | `/absensi`, `/absensi/[employeeId]` | ✔ + rekap & koreksi | Milik sendiri | Milik sendiri |
| Profil (data diri, dokumen & keluarga, sertifikat, asset kantor) | `/profil/*` | ✔ | ✔ | ✔ |
| Karyawan (daftar, tambah, detail, edit, arsip) | `/karyawan/*` | ✔ | — | — |
| Kandidat | `/kandidat`, `/kandidat/[id]` | ✔ | — | — |
| Project | `/project`, `/project/[id]` | ✔ | Lihat | Lihat |
| Customer & Project | `/project/customer` | ✔ | — | — |
| Reimburse | `/reimburse`, `/baru`, `/[id]`, `/[id]/edit` | Semua | Milik sendiri | Milik sendiri |
| Cuti (pengajuan, saldo, kalender) | `/cuti/*` | Semua + kelola libur | Milik sendiri | Milik sendiri |
| Kesehatan | `/kesehatan` | Semua | Milik sendiri | Milik sendiri |
| Jadwal pembayaran kesehatan | `/kesehatan/pembayaran` | ✔ | — | — |
| Approval | `/approval` | ✔ | ✔ | — |
| Setting (user, approval flow, divisi, cuti, kesehatan, master, absensi) | `/setting/*` | ✔ | — | — |
| Cetak biodata / rekap reimburse / rekap kesehatan | `/biodata/[id]`, `/cetak/*` | Semua | Milik sendiri | Milik sendiri |
| Inventory / Demo Unit | `/inventory/*` | *(ditunda)* | — | — |
| Unduh file / export Excel / cek kesehatan | `/api/files/[key]`, `/api/export/reimburse`, `/api/health` | sesuai hak data | sesuai hak data | sesuai hak data |

Menu sidebar diatur di `src/components/layout/nav-config.ts`. Sekali lagi: **menu bukan pengamanan** — kalau seorang
staf mengetik alamat halaman Admin secara manual, server tetap menolaknya.

---

## 8. Modul satu per satu

> **Singkatnya:** bagian ini menjelaskan setiap fitur dari sudut pandang pemakai: untuk apa, bagaimana cara
> memakainya, aturan apa yang berlaku, contoh, pesan yang mungkin muncul, dan file kode mana yang mengurusnya.

### 8.1 Login & akun
**Untuk apa:** memastikan hanya karyawan yang berhak yang bisa masuk, dan akunnya terlindungi.

**Alur pemakaian**
1. Buka aplikasi → halaman **Login** → isi email & password.
2. Akun baru (atau yang baru di-reset Admin) langsung diarahkan ke **Ganti Password** sebelum bisa memakai aplikasi.
3. User yang belum punya MFA diarahkan ke halaman **MFA**: memindai QR dengan aplikasi authenticator,
   memasukkan kode 6 digit, lalu menyimpan **10 kode cadangan** yang hanya ditampilkan sekali.
4. Login berikutnya untuk Admin & Approver menjadi dua langkah: password dulu, lalu kode dari HP.

**Aturan penting**
- Password baru **15–128 karakter**. Tidak diwajibkan campuran huruf besar/simbol, tetapi ditolak bila mudah ditebak
  (karakter berulang, deret seperti `123456` atau `qwerty`, kata umum + angka) atau memuat nama/email pemiliknya.
- Sesi berakhir setelah **1 jam tidak aktif**, atau **12 jam** sejak login walaupun aktif terus.
- Mengganti password **mencabut semua sesi lain** (misalnya yang masih terbuka di komputer lain).
- Salah login **5 kali** dari email + alamat IP yang sama → ditahan **15 menit**. Ada juga batas 20 kali per email dan
  20 kali per alamat IP. Admin bisa membuka blokir lebih cepat di Setting → User.
- Kode MFA yang sama tidak bisa dipakai dua kali. Kode cadangan hanya bisa dipakai sekali.

> **Contoh:** Ko Yosep kehilangan HP. Ia login memakai salah satu **kode cadangan**, lalu mendaftarkan ulang MFA di
> HP baru. Kalau kode cadangannya juga hilang, Admin lain (misalnya Bu Ika) bisa melakukan **Reset MFA** di
> Setting → User. Ko Yosep akan menerima email pemberitahuan setiap ada perubahan password atau MFA.

**File kode:** `src/lib/auth/*`, `src/lib/services/auth.ts`, `password.ts`, `mfa.ts`, `login-throttle.ts`,
`src/lib/password-policy.ts`, halaman `src/app/(auth)/*`.

### 8.2 Dashboard & lonceng notifikasi
**Untuk apa:** halaman pertama setelah login, berisi ringkasan yang paling perlu dilihat hari itu.

| Dashboard Admin | Dashboard Staf / Approver |
|---|---|
| Jumlah karyawan aktif & yang masuk bulan ini | Status pengajuan milik sendiri |
| Karyawan yang profil/dokumennya belum lengkap | Saldo cuti |
| Antrian approval milik sendiri & total pengajuan menunggu | Sisa plafon kesehatan |
| Jumlah project aktif | Sertifikat yang akan/sudah habis masa berlakunya |
| Dokumen & sertifikat yang akan habis masa berlakunya (semua karyawan) | Dokumen yang masih kurang |
| Kalender cuti & libur pekan ini | Kalender cuti & libur pekan ini |

**Lonceng notifikasi** di kanan atas menampilkan tiga hal: dokumen/sertifikat yang akan habis, pengajuan yang
menunggu persetujuan Anda, dan pengajuan Anda yang ditolak dalam 30 hari terakhir. Lonceng ini tidak punya tabel
sendiri; isinya selalu dihitung langsung dari data, jadi selalu sesuai kondisi terkini.

**File kode:** `src/lib/services/dashboard-queries.ts`, `notifications.ts`, halaman `src/app/(main)/dashboard`.

### 8.3 Profil Saya: data diri, dokumen & keluarga, sertifikat, asset kantor
**Untuk apa:** setiap karyawan melengkapi datanya sendiri, sehingga HRD tidak perlu mengetik ulang.

**Data diri.** Admin hanya membuat akun minimal (nama, email, divisi, jabatan, tanggal masuk, role). Selanjutnya
karyawan sendiri yang mengisi NIK, No KK, tempat & tanggal lahir, alamat, nomor HP, NPWP, BPJS, dan kontak darurat.
Bagian "Akun & Pekerjaan" (nama lengkap, jabatan, level, NIP, divisi, role, email, tanggal masuk/keluar) **hanya
boleh diubah Admin** — dicek di server, bukan hanya disembunyikan di form.

Setiap isian dirapikan otomatis sebelum disimpan:

| Isian | Aturan | Contoh |
|---|---|---|
| NIK, No KK | Tepat 16 digit; NIK tidak boleh dipakai orang lain | `3171 0123 4567 8901` → `3171012345678901` |
| NPWP | 15 atau 16 digit, disimpan tanpa titik/strip | `12.345.678.9-012.345` → `123456789012345` |
| Nomor HP | Diubah ke format `+62…`, 10–15 digit | `0812-3456-7890` → `+6281234567890` |
| Nama | Spasi dirapikan, huruf awal kapital | `budi   santoso` → `Budi Santoso` |
| BPJS Ketenagakerjaan / Kesehatan | 11 digit / 13 digit | — |
| Email | Huruf kecil semua | `Andi@Kantor.co.id` → `andi@kantor.co.id` |

**Dokumen.** Ada 12 jenis dokumen dalam dua kelompok:

| Kelompok I | Kelompok II |
|---|---|
| KTP, Kartu Keluarga, NPWP Pribadi, Pas Foto 4x6, BPJS Ketenagakerjaan, BPJS Kesehatan | Ijazah + Transkrip, SKCK, SIM A/C, Surat Nikah / Cerai, KTP Suami / Istri, Akte Kelahiran Anak |

Dokumen bisa diberi tanggal berlaku; 30 hari sebelum habis, karyawan dan Admin diingatkan lewat email. Persen
kelengkapan dokumen tampil di dashboard dan daftar karyawan.

**Keluarga.** Bagian keluarga hanya muncul bila status pernikahan bukan "Belum menikah". Data pasangan hanya untuk
status Menikah (maksimal satu). Anak bisa ditambahkan untuk status Menikah, Cerai hidup, atau Cerai mati. Dokumen keluarga
(KTP pasangan, akte anak) ditautkan ke anggota keluarga yang bersangkutan.

**Sertifikat & ijazah.**
- **Sertifikat profesional** (Level 1–3) wajib punya masa berlaku, kecuali dicentang "Permanent". Setiap sertifikat
  profesional baru **diverifikasi** lewat approval (oleh Bu Ika, nomor `CRT/…`). Setelah terverifikasi, hanya Admin
  yang bisa mengubahnya; bila sertifikat diperpanjang, tambahkan sebagai sertifikat baru.
- **Ijazah** (Gelar, Lembaga, Jenjang SMA/SMK sampai S3, tanggal lulus) langsung tersimpan tanpa verifikasi.
- File sertifikat **hanya PDF**.

**Inventory kantor.** Daftar barang kantor yang dipegang karyawan (laptop, kartu akses, dll.), dicatat oleh Admin.

> **Contoh:** Andi mengisi NIK `3171012345678901`. Ternyata NIK itu sudah dipakai karyawan lain karena salah
> ketik. Aplikasi menolak dengan pesan **"NIK sudah terdaftar, hubungi Admin"**. Admin lalu memeriksa siapa yang
> keliru lewat alat `data:cari-nik` (lihat §14.4).

**File kode:** `src/lib/services/employee.ts`, `document.ts`, `certificate.ts`, `employee-asset.ts`,
`src/lib/employee-documents.ts`, `src/lib/employee-profile.ts`, `src/lib/validators/*`.

### 8.4 Karyawan (khusus Admin)
**Untuk apa:** HRD mengelola seluruh data karyawan.

**Yang bisa dilakukan**
- **Tambah karyawan**: isi data minimal + password awal (karyawan wajib menggantinya saat login pertama).
- **Lihat detail**: data diri, dokumen, keluarga, sertifikat, riwayat periode kerja, status akun.
- **Edit**: termasuk divisi, role, email, NIP, dan tanggal masuk.
- **Resign**: isi tanggal keluar → status menjadi RESIGNED, akun dinonaktifkan. **Datanya tidak dihapus**; pindah ke
  halaman Arsip.
- **Rehire** ("Aktifkan kembali" di Arsip): memakai data lama dan membuka periode kerja baru.
- **Cetak biodata** (print browser → PDF).

**Pengaman yang perlu diketahui**
- Admin tidak bisa mengubah role akunnya sendiri atau me-resign dirinya sendiri (supaya tidak terkunci dari aplikasi).
- Admin yang menjadi **satu-satunya approver aktif** di sebuah alur tidak bisa dinonaktifkan, diturunkan ke Staf, atau
  di-resign, sebelum alurnya diganti. Kalau tidak dijaga, pengajuan bisa tidak punya penyetuju.

**File kode:** `src/lib/services/employee.ts`, `employee-queries.ts`, `user-admin.ts`, halaman `src/app/(main)/karyawan`.

### 8.5 Kandidat (khusus Admin)
**Untuk apa:** mencatat calon karyawan beserta dokumennya selama proses rekrutmen.

Status kandidat: **Applied → Interview → Accepted / Rejected**. Kandidat yang **Diterima** bisa langsung
**dikonversi** menjadi karyawan dengan satu tombol: nama, email, NIK, dan HP disalin, dokumen dipindahkan, lalu akun
dibuat (dengan password awal yang wajib diganti).

> **Contoh:** Kandidat bernama Rian diterima. Admin menekan "Jadikan karyawan", mengisi divisi, jabatan, tanggal
> masuk, dan password awal. Kalau ternyata NIK Rian pernah terdaftar atas karyawan yang sudah resign, aplikasi
> menolak dan menyarankan memakai **"Aktifkan kembali"** di Arsip, supaya riwayat lamanya tidak terduplikasi.

**File kode:** `src/lib/services/candidate.ts`, `candidate-queries.ts`.

### 8.6 Absensi & appeal
**Untuk apa:** mencatat jam datang dan pulang setiap karyawan.

**Alur pemakaian**
1. Di halaman Absensi, karyawan menekan **Clock in** saat datang dan **Clock out** saat pulang.
2. Jam diambil dari **server** (WIB), bukan dari komputer karyawan, jadi tidak bisa dimanipulasi.
3. Satu karyawan hanya punya satu catatan absensi per hari.

**Aturan**
- Terlambat / pulang cepat dihitung terhadap jam kerja di Setting (default **08:00–17:00**). Akhir pekan dan hari libur
  tidak dihitung.
- Admin bisa **mengoreksi** absensi seseorang dengan **alasan wajib** (tercatat di audit). Koreksi tidak bisa untuk
  tanggal yang akan datang atau di luar periode kerja karyawan.
- Hari kerja tanpa absensi bisa diajukan **appeal**: **Sakit** (wajib melampirkan surat keterangan sakit PDF) atau
  **Kunjungan keluar**. Appeal hanya untuk hari yang sudah lewat dan **paling lambat 7 hari** setelahnya. Disetujui
  oleh Bu Ika (nomor `APL/…`).
- Lewat 7 hari tanpa appeal, job harian memotong **1 hari cuti** untuk hari tidak hadir tersebut (hanya untuk tanggal
  setelah tanggal mulai yang diatur di Setting).

> **Contoh:** Sinta sakit hari Senin dan tidak clock in. Rabu ia mengajukan appeal "Sakit" dengan surat dokter.
> Setelah Bu Ika menyetujui, hari Senin tercatat "Sakit" dan cutinya **tidak** dipotong. Kalau Sinta lupa
> mengajukan appeal sampai lewat 7 hari, saldo cutinya otomatis berkurang 1 hari.

Pesan yang mungkin muncul: *"Anda sudah clock in hari ini"*, *"Anda belum clock in hari ini"*, *"Appeal hanya untuk
hari yang sudah lewat"*, *"Batas appeal … sudah lewat (maks 7 hari)"*.

**File kode:** `src/lib/services/attendance.ts`, `attendance-appeal.ts`, `attendance-queries.ts`, `src/lib/attendance.ts`.

### 8.7 Reimburse
**Untuk apa:** mengajukan penggantian biaya kerja (makan dengan klien, transport, akomodasi, dan sejenisnya).

**Struktur form.** Satu pengajuan bisa berisi beberapa **kunjungan**. Satu kunjungan = tanggal + company (customer) +
project. Setiap kunjungan berisi beberapa **baris** biaya: tipe, cara bayar (pribadi atau perusahaan), nominal,
lokasi, nama – jabatan orang yang ditemui, dan aktivitas.

**6 tipe reimburse** (berlaku untuk semua divisi): Entertainment, Meals, Gift, Accommodation, Transport, Allowance.

**Aturan**
- Company **wajib** dipilih dari master customer. Project harus milik company tersebut, atau pilih **New Acquisition**
  (prospek yang belum punya project) — tidak boleh keduanya.
- Kolom **Nama – Jabatan** wajib diisi untuk semua tipe kecuali **Transport**.
- Total dihitung oleh server dari baris-barisnya (nilai total dari browser tidak dipercaya).
- Minimal 1 baris untuk bisa diajukan. Hanya pengajuan berstatus **Draft** atau **Ditolak** yang bisa diubah pemohon.
- Customer & project baru boleh ditambahkan oleh divisi **Sales dan Admin**; mengubah/menghapusnya hanya Admin.
- Rekap per orang per bulan bisa **dicetak** (`/cetak/reimburse`) dan di-**export ke Excel**. Admin bisa mengunduh
  semua karyawan; yang lain hanya miliknya.
- Tidak ada upload kwitansi; tiap baris hanya mencatat ada/tidaknya kwitansi.

Pesan yang mungkin muncul: *"Baris 2: project bukan milik PT X"*, *"Baris 1: Names – Position wajib diisi untuk tipe
Meals"*, *"Tambahkan minimal 1 baris sebelum mengajukan"*, *"Reimburse yang sudah diajukan tidak bisa diubah"*.

**File kode:** `src/lib/services/reimbursement.ts`, `reimbursement-queries.ts`, `reimburse-export.ts`, `project.ts`.

### 8.8 Cuti & libur
**Untuk apa:** mengajukan cuti dan memantau saldo cuti dengan perhitungan yang selalu benar.

**Aturan dasar**
- Periode cuti = **tahun kalender** (1 Januari–31 Desember).
- Cuti baru bisa dipakai setelah **genap 1 tahun** bekerja.
- Hari cuti dihitung dalam **hari kerja**: Sabtu, Minggu, dan hari libur (yang diatur Admin di Kalender Libur) tidak
  dihitung.
- Satu pengajuan tidak boleh melewati akhir tahun. Kalau cuti dari 29 Desember sampai 3 Januari, pecah menjadi dua
  pengajuan.

**Jatah cuti per tahun**

| Masa kerja (dihitung per 1 Januari) | Jatah |
|---|---|
| Tahun pertama genap 1 tahun | Prorata: **12 − bulan genap 1 tahun** |
| 1–4 tahun | 12 hari |
| 5–14 tahun | 15 hari |
| ≥ 15 tahun | 18 hari |

> **Contoh perhitungan:** Andi mulai bekerja **1 Februari 2021**.
> - 2021: belum genap 1 tahun → belum ada cuti.
> - 2022: genap 1 tahun pada Februari → jatah prorata **12 − 2 = 10 hari**, bisa dipakai mulai 1 Februari 2022.
> - 2023–2026: masa kerja per 1 Januari 1–4 tahun → **12 hari** per tahun.
> - 2027: per 1 Januari 2027 masa kerjanya 5 tahun → **15 hari**.

**Carry over (sisa cuti dibawa ke tahun berikutnya).** Maksimal **3 hari** (bisa diubah di Setting). Sisa ini berlaku
sepanjang tahun berikutnya, dipakai lebih dulu sebelum jatah tahun berjalan, lalu hangus di akhir tahun itu.

**Penyesuaian saldo.** Admin bisa menambah atau mengurangi saldo (misalnya "pemutihan"), dan sistem otomatis mengurangi
1 hari untuk tidak hadir tanpa appeal. Saldo **boleh minus**, dan minusnya terbawa ke tahun berikutnya.

**Kalender.** Kalender cuti bulanan tampil di dashboard dan di halaman Kalender. Semua karyawan bisa melihat siapa saja
yang sedang cuti. Cuti divisi Direktur tidak butuh approval dan tampil sebagai "Direktur cuti".

Pesan yang mungkin muncul: *"Cuti baru bisa dipakai setelah genap 1 tahun masa kerja"*, *"Pengajuan melewati akhir
tahun. Pisahkan menjadi dua pengajuan."*, *"Tanggal bertabrakan dengan cuti LV/…"*, *"Sisa saldo cuti 2 hari,
pengajuan 3 hari kerja"*.

**File kode:** `src/lib/leave.ts`, `src/lib/services/leave.ts`, `leave-balance.ts`, `leave-queries.ts`.

### 8.9 Klaim kesehatan
**Untuk apa:** mengajukan penggantian biaya kesehatan sesuai plafon tahunan.

**Aturan**
- Setiap karyawan punya **plafon tahunan** (diatur Admin per orang per tahun). Tidak ada plafon bulanan.
- Kategori klaim (data awal): Rawat Jalan Dokter, Obat-obatan, Vitamin, Kacamata. Bisa ditambah di Setting → Master.
- Klaim yang melebihi **sisa plafon** langsung ditolak saat diajukan. Sisa plafon dihitung dari klaim yang sudah
  disetujui **dan** yang masih menunggu.
- Approver (Bu Ika) mengisi **nominal yang disetujui**, boleh lebih kecil dari yang diajukan. Plafon dan pembayaran
  memakai nominal yang disetujui.
- Klaim yang disetujui dibayar penuh dalam **satu jadwal pembayaran di bulan persetujuan**. Admin menandai jadwal
  sebagai "sudah dibayar" di halaman Jadwal Pembayaran.
- Persetujuan klaim yang **sudah dibayar** tidak bisa dibatalkan.
- Rekap per orang per tahun bisa dicetak di `/cetak/kesehatan`.

> **Contoh:** Plafon Devi tahun ini Rp 5.000.000. Ia sudah memakai Rp 3.500.000 dan masih punya klaim menunggu
> Rp 1.000.000. Sisa plafonnya Rp 500.000, sehingga klaim baru Rp 800.000 akan ditolak dengan pesan *"Sisa plafon
> 2026 Rp 500.000, klaim Rp 800.000"*.

**File kode:** `src/lib/services/health.ts`, `health-payout.ts`, `health-queries.ts`.

### 8.10 Project & customer
**Untuk apa:** mencatat customer dan project, lalu menghitung berapa biaya yang sudah keluar untuk tiap project.

- Project ditampilkan sebagai **"ID - Nama"**.
- Biaya project = jumlah reimburse + expense project yang sudah **disetujui**, dihitung **per tahun kalender** (bisa
  melihat tahun sebelumnya).
- Revenue project tidak ada (dihapus 2026-10-29); project hanya mencatat biaya.

**File kode:** `src/lib/services/project.ts`, `project-queries.ts`.

### 8.11 Halaman Approval
**Untuk apa:** tempat Admin & Approver menyelesaikan pengajuan yang ditugaskan kepada mereka.

Di halaman ini approver bisa **menyetujui**, **menolak** (alasan wajib), **mengoreksi** isi pengajuan sebelum
menyetujui, dan **membatalkan** persetujuan yang sudah diberikan. Badge angka di menu Approval menunjukkan jumlah yang
menunggu. Cara kerja lengkapnya ada di §9.

### 8.12 Setting (khusus Admin)
| Menu | Isinya |
|---|---|
| User & Role | Ubah role, aktif/nonaktifkan akun, reset password, reset MFA, buka blokir login |
| Approval Flow | Mengatur siapa menyetujui apa, per modul & divisi, termasuk alur cadangan (Fallback) |
| Divisi | Master divisi; divisi tanpa alur sendiri bisa "mengikuti" alur divisi lain (misalnya HR & Finance mengikuti Umum) |
| Jatah Cuti & Carry Over | Tabel jatah per masa kerja dan batas carry over |
| Plafon Kesehatan | Plafon tahunan per karyawan |
| Master Data | Tipe reimburse, kategori klaim kesehatan |
| Jam Kerja & Absensi | Jam masuk/pulang, tanggal mulai pemotongan cuti karena tidak hadir |
| Kunci Pemulihan | **Hanya untuk pemegang kunci** (Pak Rudy & Pak Leonard, `RECOVERY_KEY_HOLDERS`): membuat, menguji, dan mengganti kata sandi pemulihan backup (Bab 15) |

### 8.13 Cetak & export
| Fitur | Lokasi | Siapa |
|---|---|---|
| Biodata karyawan | `/biodata/[employeeId]` | Admin, atau karyawan itu sendiri |
| Rekap reimburse per orang per bulan | `/cetak/reimburse` | Admin semua; lainnya milik sendiri |
| Rekap klaim kesehatan per orang per tahun | `/cetak/kesehatan` | Admin semua; lainnya milik sendiri |
| Export Excel reimburse per bulan | `/api/export/reimburse` | Admin semua; lainnya milik sendiri |

Halaman cetak memakai fitur print bawaan browser (pilih "Simpan sebagai PDF"). Setiap export tercatat di audit log.

### 8.14 Modul yang ditunda & fitur lama
- **Inventory / Demo Unit** dimatikan sementara lewat saklar `FEATURES.inventory = false` di `src/lib/features.ts`.
  Menu, halaman, aksi, dashboard, dan pengingatnya nonaktif, tetapi kode & datanya tetap ada. Untuk menyalakan, cukup
  ubah saklarnya menjadi `true`.

---

## 9. Approval engine

> **Singkatnya:** setiap pengajuan mengikuti sebuah "alur" yang dipilih berdasarkan **modul** (reimburse, cuti, dan
> lain-lain) dan **divisi** pemohon. Alur bisa punya beberapa level; satu level boleh berisi beberapa orang, dan
> cukup salah satu yang menyetujui. Pemohon tidak pernah menyetujui pengajuannya sendiri.

**File kode:** `services/approval.ts` (mesin utama), `approval-effects.ts` (efek per modul), `approval-correction.ts`
(koreksi), `approval-flow.ts` (kelola alur), `approval-queries.ts` (antrian).

### 9.1 Status sebuah pengajuan
Perjalanan normal sebuah pengajuan: **DRAFT → PENDING → APPROVED**. Selengkapnya:

| Dari | Menjadi | Terjadi saat |
|---|---|---|
| DRAFT | PENDING | Pemohon menekan "Ajukan"; nomor dokumen dibuat dan approver level pertama mendapat email |
| PENDING | PENDING (level berikutnya) | Approver menyetujui, tetapi masih ada level sesudahnya |
| PENDING | APPROVED | Level terakhir menyetujui; efek modul dijalankan |
| PENDING | REJECTED | Approver menolak dengan alasan |
| REJECTED | PENDING | Pemohon merevisi lalu mengajukan ulang (mulai lagi dari level 1, nomor tetap) |
| APPROVED | PENDING | Persetujuan dibatalkan dengan alasan; efek modul dibalik |

Setiap level punya status sendiri: **WAITING** (belum gilirannya), **PENDING** (sedang menunggu keputusan),
**APPROVED**, **SKIPPED** (dilewati karena pemohon ada di level itu), atau **REJECTED**.

### 9.2 Cara mesin menentukan penyetuju
1. Cari alur **REGULAR** yang cocok dengan modul + divisi pemohon. Divisi yang tidak punya alur sendiri mengikuti alur
   divisi acuannya (misalnya HR & Finance mengikuti Umum). Alur tanpa divisi berarti berlaku untuk semua divisi.
2. Kalau alurnya tidak punya level sama sekali, pengajuan langsung **disetujui** (contoh: cuti divisi Direktur).
3. Pemohon dikeluarkan dari level yang memuat dirinya. Level yang jadi kosong ditandai **SKIPPED**.
4. Kalau semua level ter-skip, pengajuan langsung disetujui bila alurnya diatur begitu; kalau tidak, pakai alur cadangan
   **FALLBACK** (Ko Rudy / Ko Leonard).
5. Level dijalankan berurutan. Level pertama yang aktif menjadi PENDING dan approver-nya mendapat email.
6. Level terakhir menyetujui → pengajuan **APPROVED final** → efek modul dijalankan (misalnya saldo cuti berkurang).

### 9.3 Alur awal (bisa diubah di Setting → Approval Flow)
| Modul | Divisi | Level 1 | Level 2 |
|---|---|---|---|
| Reimburse, Expense | Sales | Ko Darwin / Ko Leonard | — |
| Reimburse, Expense | Engineer | Ko Yosep | Ko Rudy |
| Reimburse, Expense | Umum (+ HR, Finance) | Bu Ika / Ko Leonard | — |
| Reimburse, Expense | Direktur | Bu Ika | — |
| Cuti | semua | Ko Rudy | — |
| Cuti | Direktur | (tanpa approval) | — |
| Kesehatan, Sertifikat, Appeal absensi, Perubahan data | semua | Bu Ika | — |
| FALLBACK | — | Ko Rudy / Ko Leonard | — |

### 9.4 Contoh skenario
| Pemohon | Mengajukan | Yang terjadi |
|---|---|---|
| Andi (Engineer) | Reimburse | Ko Yosep → lalu Ko Rudy |
| Sinta (Sales) | Reimburse | Ko Darwin **atau** Ko Leonard (salah satu cukup) |
| Ko Darwin (Sales) | Reimburse | Ko Darwin dikeluarkan dari levelnya sendiri → tinggal Ko Leonard |
| Bu Ika (Umum) | Reimburse | Bu Ika dikeluarkan → tinggal Ko Leonard |
| Devi (Umum) | Klaim kesehatan | Bu Ika |
| Bu Ika | Klaim kesehatan | Level berisi Bu Ika saja → kosong → FALLBACK Ko Rudy / Ko Leonard |
| Ko Rudy (Direktur) | Cuti | Langsung disetujui, tampil "Direktur cuti" di kalender |
| Siapa pun | Mencoba menyetujui pengajuan yang tidak ditugaskan kepadanya | Ditolak oleh server |

### 9.5 Aksi approver
| Aksi | Aturan |
|---|---|
| **Setujui** | Hanya approver di level yang sedang PENDING. Belum final → email ke level berikutnya + info ke pemohon. Final → email ke pemohon + semua Admin |
| **Koreksi** | Approver level aktif boleh membetulkan isi sebelum menyetujui (reimburse per baris, expense, keterangan klaim). Perubahan tercatat "sebelum → sesudah" dan terlihat oleh pemohon |
| **Tolak** | Alasan wajib. Pengajuan menjadi REJECTED dan pemohon mendapat email. Pemohon bisa merevisi lalu mengajukan ulang; approval dimulai lagi dari level 1 dengan **nomor dokumen yang sama** |
| **Batalkan persetujuan** | Membatalkan persetujuan terakhir (selama level berikutnya belum memutuskan), oleh orang yang menyetujui atau Admin, alasan wajib. Kalau sudah final, efeknya dibalik (misalnya saldo cuti dikembalikan) |

### 9.6 Efek saat disetujui final
| Modul | Saat disetujui final | Saat persetujuan dibatalkan |
|---|---|---|
| Reimburse | Status APPROVED + tanggal disetujui | Kembali PENDING |
| Cuti | APPROVED + saldo terpakai bertambah | Saldo dikembalikan |
| Kesehatan | Nominal disetujui + APPROVED + jadwal pembayaran | Jadwal dihapus; **ditolak bila sudah dibayar** |
| Expense project | APPROVED (masuk total biaya project) | Kembali PENDING |
| Sertifikat | Terverifikasi | Kembali PENDING |
| Appeal absensi | APPROVED (hari itu tidak dipotong cuti) | Kembali PENDING |
| Perubahan data (lama) | Perubahan diterapkan | Tidak bisa dibatalkan |

> **Penting:** kalau menambah modul pengajuan baru, daftarkan efeknya di `approval-effects.ts` **dan** pembuat
> datanya di `src/test/entities.ts`. Kalau lupa, test approval akan gagal.

### 9.7 Nomor dokumen
Setiap pengajuan mendapat nomor resmi dengan format `PREFIX/TAHUN/BULAN/URUT`, misalnya `RMB/2026/10/0007`. Nomor
urut dimulai lagi dari 0001 setiap bulan.

| Prefix | Modul | Prefix | Modul |
|---|---|---|---|
| `RMB` | Reimburse | `EXP` | Expense project |
| `LV` | Cuti | `CRT` | Verifikasi sertifikat |
| `HC` | Klaim kesehatan | `APL` | Appeal absensi |

> **Kenapa begini?** Nomor dibuat dengan satu perintah database yang mengunci baris penghitungnya di dalam
> transaksi. Jadi walaupun 50 orang menekan "Ajukan" pada detik yang sama, tidak akan ada dua pengajuan dengan nomor
> yang sama, dan tidak ada nomor yang terlewat. Ini sudah dibuktikan dengan test yang mensimulasikan 50 pengajuan
> bersamaan.

---

## 10. Database

> **Singkatnya:** ada 43 tabel di PostgreSQL, didefinisikan di `prisma/schema.prisma`. Setiap perubahan struktur
> tabel selalu dibuat sebagai file **migrasi** di `prisma/migrations/`, supaya semua komputer dan server punya struktur
> yang sama persis.

### 10.1 Kelompok tabel
| Kelompok | Tabel | Isinya |
|---|---|---|
| Akun & keamanan | `User`, `MfaBackupCode`, `UploadedFile` | Akun login, kode cadangan MFA, catatan setiap upload |
| Organisasi | `Division` | Master divisi |
| Karyawan | `Employee`, `EmploymentPeriod`, `FamilyMember`, `Document`, `Certificate`, `EmployeeAsset` | Data karyawan, periode kerja, keluarga, dokumen, sertifikat, aset |
| Kandidat | `Candidate` | Calon karyawan |
| Absensi | `Attendance`, `AttendanceAppeal` | Clock in/out & appeal |
| Cuti | `LeavePolicy`, `LeaveBalance`, `LeaveAdjustment`, `LeaveRequest`, `Holiday` | Jatah, saldo per tahun, penyesuaian, pengajuan, hari libur |
| Kesehatan | `HealthCategory`, `HealthPlafond`, `HealthClaim`, `HealthPayout` | Kategori, plafon, klaim, jadwal bayar |
| Reimburse | `ReimburseType`, `Reimbursement`, `ReimbursementItem` | Tipe, pengajuan, baris biaya |
| Project | `Customer`, `Project`, `ProjectExpense` | Customer, project, expense |
| Inventory (ditunda) | `Asset`, `AssetAssignment` | Unit demo & peminjamannya |
| Approval | `ApprovalFlow`, `ApprovalFlowStep`, `ApprovalStepApprover`, `ApprovalRequest`, `ApprovalRequestStep`, `ApprovalCorrection` | Definisi alur, salinan alur per pengajuan, koreksi |
| Sistem | `NumberSequence`, `AppSetting`, `AuditLog`, `EmailLog`, `ReminderLog` | Penghitung nomor, pengaturan, audit, log email, log pengingat |

### 10.2 Hubungan utama antar tabel
```
User ─1:1─ Employee ─1:N─ EmploymentPeriod        (riwayat masuk/keluar; rehire = periode baru)
                    ├─1:N─ FamilyMember ─1:N─ Document
                    ├─1:N─ Document / Certificate / EmployeeAsset
                    ├─1:N─ Attendance, AttendanceAppeal
                    ├─1:N─ LeaveBalance (per tahun), LeaveRequest, LeaveAdjustment
                    ├─1:N─ HealthPlafond (per tahun), HealthClaim ─1:N─ HealthPayout
                    └─1:N─ Reimbursement ─1:N─ ReimbursementItem ─N:1─ Customer / Project

ApprovalFlow ─1:N─ ApprovalFlowStep ─1:N─ ApprovalStepApprover        (definisi alur)
ApprovalRequest ─1:N─ ApprovalRequestStep                                (salinan alur per pengajuan;
                                                                          menunjuk entitas lewat module + entityId)
```

### 10.3 Kebiasaan (konvensi) di database
| Kebiasaan | Penjelasan |
|---|---|
| ID | Teks acak `cuid()`, bukan nomor urut, supaya tidak bisa ditebak |
| Uang | `BigInt` (rupiah utuh tanpa desimal) |
| Tanggal tanpa jam | Tipe `@db.Date`; tanggal lahir pengecualian karena disimpan terenkripsi sebagai teks `YYYY-MM-DD` |
| Soft delete | Kolom `deletedAt` di Document, Certificate, FamilyMember, Candidate, Customer, Holiday, Reimbursement (draft), ApprovalFlow, Asset. **Setiap query wajib menyaring `deletedAt: null`** |
| Riwayat kerja | Disimpan di `EmploymentPeriod`, bukan di kolom karyawan, supaya rehire tidak menghapus riwayat |
| Pengaturan | Tabel `AppSetting`, misalnya `leave.maxCarryOver`, `attendance.workHours`, `attendance.deductionStartDate` |

### 10.4 Data pribadi yang disimpan terenkripsi
Kolom berikut disimpan dalam bentuk **sandi** (AES-256-GCM). Kalau seseorang membuka database secara langsung
(misalnya lewat Prisma Studio), yang terlihat hanya teks acak seperti `v1:9fK2…`. Aplikasi membukanya otomatis saat
menampilkan data kepada orang yang berhak.

| Tabel | Kolom |
|---|---|
| `Employee` | NIK (+ "sidik jari" `nikHash` untuk cek unik), No KK, NPWP, BPJS TK, BPJS Kesehatan, No HP, tanggal lahir, kontak darurat (nama, hubungan, HP) |
| `FamilyMember` | NIK, tanggal lahir |
| `Candidate` | NIK, No HP |
| `User` | Rahasia MFA |

> **Penting:** jangan membaca atau menulis kolom-kolom di atas secara langsung. Selalu lewat fungsi `seal…` (kunci)
> dan `open…` (buka) di `src/lib/services/personal-data.ts`. Daftar lengkap & pengelolaan kuncinya ada di
> `docs/08-INVENTARIS-DATA.md`.

### 10.5 Audit log yang tidak bisa diubah
Tabel `AuditLog` mencatat siapa melakukan apa, kapan, dari IP dan perangkat mana. Tabel ini **permanen**: ada pemicu
(trigger) di database yang menolak setiap upaya mengubah atau menghapus barisnya, dan akun aplikasi memang tidak punya
hak untuk itu. Konsekuensinya, user yang punya riwayat audit tidak bisa dihapus permanen — cukup dinonaktifkan.

### 10.6 Cara mengubah struktur database (migrasi)
1. Ubah `prisma/schema.prisma`.
2. Buat file migrasi: `npx prisma migrate dev --name nama_perubahan` (di terminal biasa). Bila dijalankan dari skrip
   atau agen yang tidak interaktif, pakai `npx prisma migrate diff --from-config-datasource --to-schema
   prisma/schema.prisma --script` lalu simpan hasilnya sebagai folder migrasi baru.
3. Periksa isi SQL-nya, lalu terapkan: `npx prisma migrate deploy`.
4. **Wajib**: `npx prisma generate`, supaya kode mengenali struktur baru.
5. Tulis alasan perubahan di file migrasi (aturan project).

Migrasi selalu dijalankan memakai akun database pemilik (`MIGRATE_DATABASE_URL`), bukan akun aplikasi.

---

## 11. Pekerjaan latar belakang (worker)

> **Singkatnya:** worker adalah program terpisah (`npm run worker`) yang bertugas mengirim email dan menjalankan
> tugas rutin harian. **Kalau worker mati, email tidak terkirim** — tetapi tidak hilang; email akan terkirim begitu
> worker hidup lagi.

Antrian dan jadwalnya disimpan di PostgreSQL (skema `pgboss`), jadi tidak butuh server antrian tambahan.

| Job | Jadwal (WIB) | Apa yang dikerjakan |
|---|---|---|
| `email.send` | Setiap ada antrian | Mengirim email lalu mencatatnya di `EmailLog`. Kalau gagal, dicoba ulang 3 kali dengan jeda yang makin panjang |
| `leave.rollover` | 00:30 | Membuat saldo cuti tahun baru dan memindahkan carry over |
| `attendance.deduct` | 01:00 | Memotong 1 hari cuti untuk hari tidak hadir yang lewat 7 hari tanpa appeal |
| `storage.orphan-purge` | 03:00 | Menghapus file upload yang sudah 24 jam tidak dipakai data apa pun |
| `reminder.certificate`, `reminder.document` | 07:00 | Mengirim email pengingat 30 hari sebelum masa berlaku habis |
| `reminder.asset` | 07:00 | Nonaktif (modul Inventory ditunda) |

> **Contoh:** sertifikat CCNA milik Andi berakhir 30 November. Pada 31 Oktober pukul 07:00, worker mengirim email
> pengingat ke Andi dan semua Admin. Pengingat hanya dikirim **sekali** per sertifikat per tanggal berakhir
> (dicatat di `ReminderLog`), jadi tidak ada email berulang setiap hari.

**File kode:** `worker/index.ts`, `src/lib/services/leave-balance.ts`, `attendance-appeal.ts`,
`upload.ts`, `reminder.ts`.

---

## 12. Email & notifikasi

> **Singkatnya:** semua email dimasukkan ke antrian dulu, lalu dikirim oleh worker. Template email ditulis seperti
> komponen tampilan (React Email), sehingga mudah diubah.

| Template | Dikirim saat | Penerima |
|---|---|---|
| `approval-requested` | Pengajuan diajukan / naik ke level berikutnya | Approver level yang aktif |
| `approval-progress` | Disetujui tapi belum final | Pemohon |
| `approval-final` | Disetujui final | Pemohon + semua Admin |
| `approval-rejected` | Ditolak | Pemohon |
| `reminder-expiry` | 30 hari sebelum masa berlaku habis | Karyawan + Admin |
| `security-notice` | Password/MFA diganti atau di-reset, kode cadangan dibuat ulang atau dipakai | Pemilik akun |
| `security-alert` | Ada kejadian mencurigakan (lihat §14.6) | Semua Admin aktif |

Setiap email berisi nomor dokumen, ringkasan, dan link langsung ke halaman terkait. Di komputer developer, email tidak
benar-benar terkirim: semuanya ditangkap **Mailpit** dan bisa dilihat di http://localhost:8025. Di produksi, koneksi
ke server email **wajib terenkripsi (TLS)**; server email tanpa TLS akan ditolak dan emailnya tercatat gagal.

**File kode:** `src/lib/mail/` (`queue.ts`, `send-email.ts`, `templates/*.tsx`, `approval-emails.ts`, `security-emails.ts`).

---

## 13. Perjalanan sebuah file

> **Singkatnya:** file (PDF) yang di-upload disimpan dengan nama acak, isinya dikunci, dan hanya bisa diunduh lewat
> satu "pintu" yang selalu memeriksa hak akses.

### 13.1 Dari upload sampai diunduh
1. Karyawan memilih file di form. Browser memeriksa jenis dan ukurannya.
2. File dikirim ke server lewat `uploadFileAction`.
3. Server memeriksa **isi** file (bukan hanya ekstensinya): harus PDF asli, maksimal 5 MB, dan **tidak boleh berisi
   JavaScript atau aksi otomatis** yang bisa berbahaya.
4. Server memeriksa **kuota**: maksimal 30 file per jam dan 200 MB per 24 jam per orang.
5. File diberi nama acak (`<uuid>.pdf`), **dienkripsi**, lalu disimpan. Upload dicatat di `UploadedFile` atas nama
   pengunggahnya.
6. Saat form disimpan, file "ditautkan" ke data (dokumen, sertifikat, surat sakit). File **hanya bisa ditautkan oleh
   orang yang meng-upload-nya**.
7. Saat ada yang ingin membuka file, permintaan masuk ke `/api/files/[key]`. Server memeriksa: sudah login? nama file
   valid? siapa pemilik datanya? apakah peminta berhak? Bila lolos, file dibuka kuncinya dan dikirim; unduhan dicatat
   di audit log.
8. File yang di-upload tapi tidak pernah dipakai akan dihapus otomatis setelah 24 jam.

### 13.2 Ringkasan aturan
| Aspek | Aturan |
|---|---|
| Format | Upload baru **hanya PDF**; file JPG/PNG lama tetap bisa dibuka |
| Ukuran | Maksimal 5 MB per file; satu request = satu file |
| Nama file | `<uuid>.<pdf\|jpg\|png>` — nama lain ditolak (mencegah trik membuka file di luar folder) |
| Penyimpanan | Terenkripsi AES-256-GCM; nama file ikut "dikunci" sehingga file tidak bisa ditukar diam-diam |
| Respons unduhan | 401 belum login, 403 tidak berhak, 404 tidak ada |

> **Penting:** kalau menambah kolom file baru di database, file itu wajib ditautkan lewat
> `assertFileKeyAvailable(tx, key, actorId)` **dan** didaftarkan di `src/lib/services/upload.ts#referencedKeys`.
> Kalau lupa, job pembersih file yatim akan mengira file itu tidak dipakai lalu menghapusnya.

---

## 14. Keamanan

> **Singkatnya:** keamanan dipasang berlapis, seperti kantor yang punya satpam di gerbang, kunci di setiap pintu,
> brankas untuk dokumen penting, dan CCTV. Kalau satu lapisan jebol, lapisan berikutnya masih melindungi.
> Detail teknis ada di `docs/02-TECH-SPEC.md` §9 dan `docs/08-INVENTARIS-DATA.md`.

### 14.1 Ancaman & pengamannya
| Kalau penyerang mencoba… | Yang menghalangi |
|---|---|
| Menebak password | Kebijakan password panjang, batas percobaan login, MFA untuk semua akun |
| Memakai sesi yang tertinggal di komputer orang lain | Sesi habis setelah 1 jam tidak aktif / 12 jam; ganti password mencabut semua sesi |
| Menyisipkan script jahat ke halaman (XSS) | Content Security Policy bernonce, React yang otomatis "meng-escape" teks |
| Mengakses aplikasi dari luar kantor | nginx hanya menerima jaringan kantor/VPN, HTTPS wajib |
| Membuka data orang lain dengan mengganti alamat | Pengecekan hak akses di setiap halaman, action, dan unduhan file |
| Mencuri isi database (dump / SQL injection) | Data pribadi terenkripsi, query berparameter, larangan SQL mentah di lint |
| Mencuri file upload atau backup | File & backup terenkripsi; kunci backup dipegang di luar server |
| Membobol aplikasi lalu merusak database | Akun database aplikasi tidak punya hak menghapus/mengubah tabel |
| Menghapus jejak | Audit log permanen (trigger database) |
| Mengunggah file berbahaya | Cek isi file, tolak PDF ber-JavaScript, kuota upload |
| Diam-diam menyedot banyak data | Alarm email ke Admin bila ada akses data besar-besaran |

### 14.2 Status pekerjaan keamanan (hardening)
| Tahap | Isi | Status |
|---|---|---|
| 1 | Dependency aman: 0 kerentanan di paket produksi; hanya Prisma yang boleh menjalankan script saat install | Selesai |
| 2 | Login & sesi | Selesai |
| 3 | Browser & pintu depan (CSP, header keamanan, nginx) | Selesai (nginx disiapkan) |
| 4 | Database & data (enkripsi, role database, backup terenkripsi, container) | Selesai; stack produksi lulus gladi resik emulasi (2026-10-22) |
| 5 | MFA untuk Admin & Approver + email keamanan | Selesai |
| 6 | Audit permanen, alarm, monitoring, SMTP wajib TLS | Selesai. Skrip salinan backup ke NAS/cloud siap; tujuannya menunggu keputusan manajemen |
| 7 | Upload & file | Selesai (antivirus ClamAV opsional, belum) |
| 8 | UU PDP lanjutan (masa simpan data, DPIA, prosedur insiden) | Dilewati atas keputusan pemilik project (2026-10-21) |
| 9 | Dokumen deployment + gladi resik | Dokumen lengkap; **gladi resik emulasi 18/18 lulus** (2026-10-22, docs/07 §13.6); gladi singkat di server Ubuntu asli sebelum go-live |
| 10 | CI otomatis, Dependabot, pentest | Belum (opsional) |

### 14.3 Login, sesi & MFA
Sudah dijelaskan dari sisi pemakai di §8.1. Dari sisi teknis: sesi memakai JWT httpOnly yang juga menyimpan
`sessionVersion`; setiap request membaca ulang status akun dari database, sehingga akun yang dinonaktifkan atau
password yang diganti **langsung** berlaku. Rahasia MFA disimpan terenkripsi, dan kode cadangan hanya disimpan dalam
bentuk hash.

### 14.4 Data & database
- **Enkripsi data pribadi & file** (§10.4, §13). Kuncinya disimpan di environment variable `DATA_ENCRYPTION_KEYS`
  (bisa diganti berkala tanpa kehilangan data lama) dan `DATA_INDEX_KEY`. Salinan kunci dipegang **Pak Rudy & Pak
  Leonard**; Divisi IT sebagai pemegang kunci belum diputuskan. Cara menitipkan, membuka kembali, dan menangani
  kunci yang hilang dibahas khusus di **Bab 15**.
- **Tiga akun database** dengan hak berbeda:

| Akun | Dipakai oleh | Boleh |
|---|---|---|
| `oa` (pemilik) | Migrasi, seed, Prisma Studio | Semua |
| `oa_app` | Aplikasi & worker | Hanya baca/tulis isi tabel (tidak bisa membuat, mengubah, atau menghapus tabel) |
| `oa_backup` | Backup harian | Hanya membaca |

- Di produksi, database berada di jaringan Docker internal tanpa akses internet. Hanya container yang butuh database
  yang tersambung, dan setiap login ke database tercatat.
- Untuk keperluan sah (misalnya memeriksa NIK yang salah ketik), engineer memakai alat `data:lihat` dan
  `data:cari-nik` di server. Alat ini wajib diisi alasan dan nama, dan setiap pemakaiannya tercatat di audit log.

### 14.5 Browser & jaringan
- **Content Security Policy** dengan nonce per request: browser hanya mau menjalankan script yang benar-benar dikirim
  aplikasi. Script, font, atau gambar dari domain luar harus didaftarkan dulu di `src/lib/security/csp.ts`.
- Header keamanan: X-Frame-Options DENY (tidak bisa disematkan di situs lain), nosniff, Referrer-Policy,
  Permissions-Policy, COOP & CORP.
- **nginx** di depan aplikasi: HTTPS (TLS 1.2/1.3), HSTS 1 tahun, hanya subnet kantor (`ALLOWED_SUBNETS`), dan batas
  permintaan per IP (umum 10/detik, kirim form 2/detik, login 10/menit, export 6/menit).

### 14.6 Audit, alarm & monitoring
- **Yang tercatat di audit log** (dengan IP & perangkat bila dari request): buat/ubah/hapus data, setuju/tolak/batal,
  resign/rehire, login berhasil/gagal/buka blokir, unduh file, export, buka data pribadi lewat alat engineer, dan alarm
  keamanan.
- **Alarm email ke semua Admin** bila:
  - ada **5 kali login gagal** ke akun Admin/Approver dalam 15 menit;
  - ada **perubahan role** seseorang;
  - satu orang melakukan **50 atau lebih** unduhan/export/buka data pribadi dalam 1 jam.
- **Cek kesehatan:** `GET /api/health` menjawab 200 bila aplikasi dan database sehat, atau 503 bila database tidak bisa
  dihubungi. Dipakai oleh Docker untuk memantau container aplikasi.

### 14.7 Kebersihan di komputer developer
- Data karyawan **asli dilarang** dipakai di komputer developer. Untuk contoh, pakai `npm run dev:data-palsu`.
- Kunci enkripsi developer selalu berbeda dari kunci produksi.
- `npm run lint` menolak penulisan SQL mentah yang rawan injeksi (`$queryRawUnsafe`, `$executeRawUnsafe`).
- Terminal dev tidak menampilkan isi form (password, NIK) yang dikirim ke server.

---

## 15. Pengelolaan & penitipan kunci enkripsi

> **Singkatnya:** data pribadi dan file karyawan dikunci dengan **kunci data** yang tersimpan di server. Kalau server
> rusak total, kunci itu ikut hilang — dan datanya tidak bisa dibuka lagi. Karena itu sistem otomatis menyimpan
> **salinan cadangan** kunci data di setiap backup, dalam keadaan terkunci dengan **kata sandi pemulihan** milik
> **Pak Rudy dan Pak Leonard**. Para Direktur tidak menjalankan perintah teknis apa pun: mereka cukup membuat kata sandi
> itu di aplikasi, lalu mengetiknya lagi bila server harus dipulihkan.

Bab ini menjelaskan konsepnya. Prosedur rinci ada di `docs/08-INVENTARIS-DATA.md` §4–5, dan langkah di server ada di
`docs/07-DEPLOYMENT.md`. Kalau suatu saat prosedurnya berubah, perbarui ketiganya.

### 15.1 Kenapa kunci perlu dititipkan
Bayangkan kantor yang menyimpan arsip penting di dalam **brankas**. Kunci brankasnya disimpan di laci kantor supaya
bisa dipakai setiap hari. Masalahnya, kalau kantor terbakar, isi brankas mungkin selamat (kita punya backup), tetapi
kunci di laci ikut hangus — dan brankas itu tidak akan pernah bisa dibuka lagi.

Solusinya: buat **kunci cadangan** dan titipkan di **kotak deposit bank**. Petugas bank mengurus semua prosedurnya,
tetapi kotak itu hanya bisa dibuka bila pemiliknya datang dan memasukkan **PIN-nya sendiri**.

Dalam aplikasi ini:
- **brankas** = kolom data pribadi di database, file upload, dan backup;
- **kunci di laci** = kunci data di file `.env.production` di server;
- **kunci cadangan** = titipan kunci data (`kunci-data.age`), yang ikut tersimpan di setiap backup;
- **petugas bank** = petugas IT, yang menjalankan semua langkah teknis;
- **PIN pemilik** = kata sandi pemulihan Pak Rudy atau Pak Leonard.

> **Kenapa begini?** Kunci data harus tetap ada di server, karena aplikasi memerlukannya setiap kali menampilkan data.
> Yang bisa kita lakukan adalah memastikan selalu ada **cadangan yang aman** di luar server, dikendalikan lebih dari
> satu orang, sehingga satu orang yang lupa atau berhalangan tidak membuat data perusahaan hilang. Petugas IT bisa
> menjalankan semuanya, tetapi tidak bisa membuka backup tanpa salah satu Direktur.

### 15.2 Siapa melakukan apa
| Pihak | Yang dilakukan | Yang tidak bisa / tidak perlu dilakukan |
|---|---|---|
| **Pak Rudy & Pak Leonard** (pemegang kunci) | Membuat kata sandi pemulihan di Setting → Kunci Pemulihan; mengujinya tiap 3 bulan; hadir dan mengetiknya saat pemulihan | Tidak perlu perintah teknis, USB, atau amplop |
| **Petugas IT / admin server** (pelaksana) | Deploy, backup, menyalin backup ke luar server, menjalankan pemulihan | Membuka backup tanpa salah satu Direktur |
| **Sistem** | Membuat kunci, menguncinya dengan kata sandi, memperbarui titipan & gembok di setiap deploy, menyalin semuanya ke setiap backup | — |
| **Divisi IT** sebagai pemegang kunci | **Belum diputuskan** oleh pemilik project (catatan 2026-10-20) | — |

### 15.3 Jenis kunci & tempat simpannya
| Kunci | Bentuknya | Fungsinya | Disimpan di |
|---|---|---|---|
| **Kunci data** (`DATA_ENCRYPTION_KEYS`, `DATA_INDEX_KEY`) | Teks acak | Mengunci & membuka data pribadi dan file upload; membuat sidik jari NIK | `.env.production` di server; salinannya = titipan `kunci-data.age` |
| **Kunci pemulihan** | Kunci pribadi `age`, satu per Direktur, **terkunci kata sandi pemulihan** | Membuka backup & titipan kunci data | File `kunci-pemulihan-<email>.age` di volume `recovery`, ikut setiap backup (`kunci_*.tar`) |
| **Gembok** | Kunci publik `age` (`age1…`) | Mengunci backup & titipan | Tabel `RecoveryKey` dan file `penerima.txt` — tidak rahasia |
| **Kata sandi pemulihan** | Kalimat yang dibuat Direktur sendiri | Membuka kunci pemulihan miliknya | **Hanya di ingatan / pengelola password pribadi Direktur** — tidak disimpan di server maupun database |

> **Penting:** file kunci pemulihan sengaja **tidak** disimpan di database. Bila database bocor (misalnya lewat SQL
> injection), pencuri tidak mendapat bahan untuk menebak kata sandi pemulihan. Menebak pun lambat: setiap tebakan
> butuh sekitar satu detik komputasi (scrypt), sementara kata sandinya minimal 15 karakter.

### 15.4 Saat Direktur menyimpan kata sandi pemulihan
1. Sistem memeriksa password login, lalu memastikan kata sandi pemulihan cukup panjang, tidak mudah ditebak, dan berbeda
   dari password login.
2. Sistem membuat kunci `age` khusus untuk Direktur itu, lalu menguncinya dengan kata sandi pemulihan.
3. Gembok Direktur dicatat; `penerima.txt` dan titipan kunci data ditulis ulang untuk semua pemegang kunci.
4. Kejadian ini dicatat di audit log, dan semua Admin menerima email alarm keamanan.
5. Backup malam berikutnya dikunci untuk gembok kedua Direktur, dan ikut menyalin folder kunci (`kunci_*.tar`).

Backup sengaja **menolak jalan** selama pemegang kunci yang sudah membuat kata sandi pemulihan kurang dari dua, supaya
data tidak pernah bergantung pada satu orang saja.

> **Contoh:** pada 3 November 2026, setelah aplikasi dipasang, Pak Rudy login, membuka Setting → Kunci Pemulihan, lalu
> menyimpan sebuah kalimat yang hanya ia ketahui. Statusnya "Backup menunggu 2 pemegang kunci (1 dari 2)". Siangnya
> Pak Leonard melakukan hal yang sama, dan status berubah menjadi "Backup berjalan". Malam itu backup pertama terkunci
> untuk keduanya. Tidak ada USB, amplop, atau perintah yang perlu mereka jalankan.

### 15.5 Saat server harus dipulihkan
1. Petugas IT menyiapkan server (bisa server baru), mengambil backup terbaru dari NAS/cloud, lalu menjalankan
   `scripts/restore.sh`.
2. Skrip menampilkan daftar pemegang kunci. Salah satu Direktur yang hadir **mengetik kata sandi pemulihannya**; kata
   sandi itu tidak tampil di layar.
3. Skrip melanjutkan sendiri:
   - membuka kunci pemulihan (hanya di memori);
   - membuka titipan kunci data dan menulisnya ke `.env.production` server baru;
   - memulihkan database dan file;
   - memeriksa kunci;
   - menyalakan aplikasi.
4. Setelah itu server kembali normal. Mati listrik berikutnya tidak membutuhkan kata sandi lagi.

Langkah lengkapnya ada di `docs/07-DEPLOYMENT.md` §10.

> **Kenapa tidak meminta kata sandi setiap kali server menyala?** Karena aplikasi akan terkunci setiap mati listrik,
> sampai Direktur datang. Kata sandi pemulihan hanya "kunci darurat" untuk saat kunci di server benar-benar hilang.

### 15.6 Pemeliharaan
| Kejadian | Yang perlu dilakukan |
|---|---|
| Kunci data diganti (rotasi) | Ikuti `docs/08-INVENTARIS-DATA.md` §5.2. Titipan diperbarui otomatis saat deploy; Direktur tidak perlu apa-apa |
| Setiap 3 bulan | Dashboard mengingatkan Direktur untuk **menguji** kata sandi pemulihan |
| Direktur lupa kata sandi, atau curiga kata sandinya diketahui orang lain | Membuat kata sandi baru (tombol "Ganti"). Backup lama tetap bisa dibuka dengan kata sandi lama, atau oleh Direktur lain |
| Email akun pemegang kunci diganti | Perbarui `RECOVERY_KEY_HOLDERS`, jalankan `dc up -d`, lalu Direktur membuat ulang kata sandi pemulihan |
| Pemegang kunci bertambah (misalnya Divisi IT, bila diputuskan) | Tambah emailnya di `RECOVERY_KEY_HOLDERS`, jalankan `dc up -d`, lalu orangnya membuat kata sandi pemulihan |

### 15.7 Skenario darurat
| Kejadian | Akibatnya | Yang dilakukan |
|---|---|---|
| Mati listrik / server restart | Tidak ada — kunci tetap di server | Tidak perlu apa-apa |
| Server rusak total | Aplikasi tidak bisa membuka data sampai dipulihkan | Pemulihan (15.5) dengan salah satu Direktur |
| Satu Direktur lupa kata sandi | Masih aman: Direktur lain tetap bisa membuka | Yang lupa membuat kata sandi baru |
| Kedua Direktur lupa, server masih hidup | Aplikasi tetap jalan, tetapi backup yang ada tidak bisa dibuka | **Segera** keduanya membuat kata sandi baru, lalu jalankan backup baru |
| Kunci data dicurigai bocor | Orang yang memegang salinan database bisa membuka data pribadi | Rotasi kunci, ganti password database & `AUTH_SECRET`, periksa audit log |
| Kedua Direktur lupa kata sandi **dan** server rusak | Data pribadi terenkripsi **hilang permanen** | Tidak ada cara memulihkan — inilah alasan uji kata sandi tiap 3 bulan |

### 15.8 Aturan emas
- Kata sandi pemulihan **tidak pernah** dikirim lewat chat atau email, dan tidak ditulis di kertas yang mudah ditemukan.
- Kata sandi pemulihan **selalu berbeda** dari password login.
- Kunci produksi **tidak pernah** disalin ke laptop developer; kunci developer dan produksi selalu berbeda.
- Kunci lama **tidak pernah** dihapus dari `DATA_ENCRYPTION_KEYS`.
- Folder `backups/` **selalu** disalin ke luar server (`docs/07-DEPLOYMENT.md` §7).
- Uji pemulihan minimal setiap 3 bulan di server percobaan, dengan salah satu Direktur hadir.

---

## 16. Konfigurasi (environment variable)

> **Singkatnya:** pengaturan yang berbeda antara komputer developer dan server disimpan di file `.env` (developer)
> atau `.env.production` (server). File ini berisi rahasia, jadi **tidak boleh di-commit**. Contoh isinya ada di
> `.env.example` dan `.env.production.example`.

| Variabel | Dipakai oleh | Penjelasan |
|---|---|---|
| `DATABASE_URL` | Aplikasi, worker, seed, skrip data | Alamat database dengan akun `oa_app` |
| `MIGRATE_DATABASE_URL` | Prisma CLI (migrate, seed, Studio) | Alamat database dengan akun pemilik `oa`. Kosong = memakai `DATABASE_URL` |
| `TEST_DATABASE_URL` | Test database | Nama database **wajib** berakhiran `_test`; dihapus & dibuat ulang setiap test |
| `DATA_ENCRYPTION_KEYS` | Aplikasi, migrate | Kunci enkripsi, format `v1:<base64 32 byte>`. Buat dengan `npm run keys:generate` |
| `DATA_INDEX_KEY` | Aplikasi, migrate | Kunci "sidik jari" NIK |
| `AUTH_SECRET` | Aplikasi | Rahasia untuk menandatangani sesi login (`npx auth secret`) |
| `AUTH_URL`, `AUTH_TRUST_HOST` | Aplikasi (produksi) | `https://<domain>`. Di komputer developer `AUTH_URL` sengaja dikosongkan |
| `APP_URL` | Aplikasi, worker | Alamat publik aplikasi, dipakai untuk link di email |
| `CSP_MODE` | Aplikasi | `enforce` (memblokir) atau `report-only` (hanya melaporkan) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Worker | Server email. Developer: Mailpit `localhost:1025`. `SMTP_REQUIRE_TLS=true` untuk memaksa TLS di dev |
| `STORAGE_DRIVER`, `UPLOAD_DIR`, `MAX_UPLOAD_MB` | Aplikasi, worker | Penyimpanan file: `local`, `./storage/uploads`, `5` |
| `TZ` | Semua | `Asia/Jakarta` |
| `SEED_PASSWORD`, `SEED_MUST_CHANGE_PASSWORD` | Seed | Password awal akun hasil seed; di produksi wajib diganti saat login pertama |
| `SEED_MODE`, `SEED_ADMIN_EMAIL` | Seed produksi | `production` = hanya akun Admin sistem (`SEED_ADMIN_EMAIL`) + aturan cuti, tanpa data contoh |
| `DEV_ALLOWED_ORIGINS` | Dev | Alamat tambahan yang boleh membuka dev server (misalnya IP laptop lain di jaringan) |
| `RECOVERY_KEY_HOLDERS` | Aplikasi, migrate | Email akun pemegang kunci (Pak Rudy & Pak Leonard), dipisah koma — harus sama persis dengan email login mereka |
| `RECOVERY_DIR` | Aplikasi, migrate | Folder file kunci pemulihan. Developer: `./storage/recovery`; produksi: volume `recovery` |
| Khusus produksi: `POSTGRES_*`, `POSTGRES_APP_PASSWORD`, `POSTGRES_BACKUP_PASSWORD`, `APP_DOMAIN`, `BIND_IP`, `ALLOWED_SUBNETS`, `TLS_CERT_PATH`, `TLS_KEY_PATH`, `BACKUP_TIME`, `BACKUP_KEEP_DAYS` | Docker Compose produksi | Lihat komentar lengkap di `.env.production.example` |
| `OFFSITE_DIR`, `OFFSITE_RCLONE`, `OFFSITE_KEEP_DAYS`, `OFFSITE_PING_URL` | `scripts/backup-offsite.sh` (di host) | Tujuan salinan backup ke luar server — `docs/07-DEPLOYMENT.md` §7 |

---

## 17. Menyiapkan komputer developer

> **Singkatnya:** nyalakan Docker, isi file `.env`, pasang paket, siapkan database, lalu jalankan aplikasi dan
> worker. Ikuti langkah di bawah persis berurutan.

### 17.1 Yang perlu dipasang dulu
Node.js 24, npm 11, Docker Desktop, dan Git. Pengguna Windows sebaiknya menambahkan pengecualian Windows Defender untuk
folder project dan folder cache npm; tanpa ini `npm install` bisa sangat lambat.

### 17.2 Langkah pertama kali
```bash
docker compose up -d                 # PostgreSQL (5432) + Mailpit (1025 / UI 8025); akun oa_app dibuat otomatis
cp .env.example .env                 # lalu isi: AUTH_SECRET, kunci data (npm run keys:generate), SEED_PASSWORD
npm ci                               # pasang paket sesuai lockfile (postinstall menjalankan prisma generate)
npx prisma migrate deploy            # buat semua tabel (memakai akun pemilik via MIGRATE_DATABASE_URL)
npx prisma generate                  # wajib setelah migrasi
npx prisma db seed                   # data CONTOH dev: divisi, 8 akun contoh, alur approval, master data
npm run dev                          # aplikasi di http://localhost:3000
npm run worker                       # di terminal lain — WAJIB agar email & job harian jalan
```
Penjelasan singkat setiap langkah:
1. **`docker compose up -d`** menyalakan database dan penangkap email di latar belakang.
2. **`.env`** berisi alamat database dan rahasia. Kunci enkripsi dibuat sendiri, jangan menyalin dari orang lain.
3. **`npm ci`** memasang paket persis sesuai `package-lock.json`, sehingga semua developer memakai versi yang sama.
4. **`migrate deploy` + `generate`** membuat tabel lalu memperbarui "kamus" Prisma di kode.
5. **`db seed`** mengisi data awal supaya aplikasi langsung bisa dicoba.
6. **`npm run dev` dan `npm run worker`** menjalankan aplikasi dan pekerja latar belakangnya.

> **Penting:** kalau database Anda dibuat sebelum hardening Tahap 4, jalankan `npm run db:roles` (membuat akun
> `oa_app`) lalu `npm run data:encrypt` (mengenkripsi data lama).

### 17.3 Akun contoh
Format email `<nama>@artha-mitra.local`, password sesuai `SEED_PASSWORD`:

| Role | Akun |
|---|---|
| Admin | rudy, leonard, ika |
| Approver | yosep, darwin |
| Staf | andi, sinta, devi |

Semua akun akan diminta mendaftarkan MFA saat login pertama.

### 17.4 Perintah yang sering dipakai
| Perintah | Fungsi |
|---|---|
| `npm run dev` / `npm run worker` | Menjalankan aplikasi / worker |
| `npm run lint` · `npm run typecheck` · `npm test` | Tiga pemeriksaan wajib sebelum menyatakan pekerjaan selesai |
| `npx vitest run --project unit` | Test cepat tanpa database |
| `npx prisma studio` | Melihat isi database (kolom pribadi tampil sebagai sandi) |
| `npm run keys:generate` | Membuat kunci enkripsi baru |
| `npm run data:encrypt [-- --cek]` | Mengenkripsi data lama / mengganti kunci (`--cek` hanya menghitung) |
| `npm run data:lihat -- --karyawan <email> --alasan "…" --oleh "…"` | Melihat data asli satu karyawan (tercatat audit) |
| `npm run data:cari-nik -- <NIK> --alasan "…" --oleh "…"` | Mencari karyawan lewat NIK |
| `npm run dev:data-palsu [-- --kosongkan]` | Mengisi / menghapus data diri palsu untuk uji coba |
| `npm run db:roles` | Membuat ulang akun-akun database di komputer developer |
| `npm run build` / `npm run build:worker` | Build versi produksi aplikasi / worker |

---

## 18. Testing & standar kualitas

> **Singkatnya:** setiap aturan bisnis punya test otomatis. Ada test cepat tanpa database, dan test yang memakai
> database PostgreSQL sungguhan (database khusus test, bukan database kerja).

| Jenis test | File | Contoh yang dites |
|---|---|---|
| `unit` | `*.test.ts` (±22 file) | Format NIK/HP/NPWP, perhitungan hari cuti, enkripsi, kebijakan password, CSP |
| `db` | `*.db.test.ts` (±35 file) | Approval berjenjang, nomor dokumen paralel, saldo cuti, plafon kesehatan, konversi kandidat, MFA, upload, audit |

**Hal yang perlu diketahui**
- Test database memakai `TEST_DATABASE_URL` (nama berakhiran `_test`) yang **dibuat ulang otomatis** setiap test
  dijalankan. Database kerja Anda tidak pernah disentuh.
- Helper siap pakai: `src/test/db.ts` (`testDb`, `resetDb`, `createTestEmployee`), `src/test/seed.ts`
  (`resetAndSeed`), dan `src/test/entities.ts`.
- Kunci enkripsi khusus test sudah tertulis di `vitest.config.mts`.

**Kapan sebuah pekerjaan dianggap selesai?**
1. `npm run lint` lulus (gaya kode & aturan keamanan).
2. `npm run typecheck` lulus (tidak ada kesalahan tipe).
3. `npm test` lulus (semua test unit & database).
4. Dicocokkan dengan "Kriteria Selesai" fase di `docs/PLAN.md`.
5. Pemilik project me-review lalu commit.

---

## 19. Deployment & operasional

> **Singkatnya:** di server kantor (Ubuntu), seluruh aplikasi dijalankan dengan satu perintah Docker Compose. Ada
> 6 bagian (service); database disembunyikan di jaringan internal, dan backup dibuat setiap malam dalam keadaan
> terkunci.

### 19.1 Enam service di produksi
| Service | Isi | Jaringan | Peran |
|---|---|---|---|
| `db` | postgres:17.11-trixie | db_net (internal) | Database. Hanya menerima koneksi dari jaringan internal dengan password; login & perubahan struktur dicatat |
| `migrate` | Image dari project | db_net | Jalan sekali setiap deploy: menerapkan migrasi, `data:encrypt`, lalu `recovery:refresh` (memperbarui titipan kunci data). Kalau kunci salah, ia gagal dan aplikasi tidak dijalankan |
| `app` | Next.js | db_net, edge | Aplikasi web; dipantau lewat `/api/health`; tidak dibuka langsung ke luar |
| `worker` | Worker pg-boss | db_net, egress | Email & job harian |
| `proxy` | nginx:1.30.6-alpine | edge | Satu-satunya pintu masuk (port 80/443 di IP LAN server) |
| `backup` | postgres + age | db_net | Backup harian terenkripsi ke folder `./backups` (database, file upload, salinan folder kunci pemulihan); menolak jalan bila pemegang kunci < 2 |

Semua container dikunci rapat: tidak bisa menaikkan hak akses, hak khusus Linux dicabut, sistem file hanya-baca
(kecuali bagian yang memang perlu ditulis), dibatasi pemakaian RAM/CPU/jumlah proses, dan ukuran log dibatasi.
Setiap service hanya menerima rahasia yang dibutuhkannya.

### 19.2 Deploy pertama (ringkas)
```bash
cp .env.production.example .env.production   # isi semua nilai (termasuk RECOVERY_KEY_HOLDERS), lalu chmod 600
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm migrate npx prisma db seed
# Pak Rudy & Pak Leonard membuat kata sandi pemulihan di Setting → Kunci Pemulihan (tanpa perintah teknis)
sudo crontab -e   # jadwal salinan backup ke luar server, lihat docs/07-DEPLOYMENT.md §7.7
```
Panduan lengkap langkah demi langkah ada di **`docs/07-DEPLOYMENT.md`**. Isinya: prasyarat server, Docker, pintu
jaringan yang terbuka (tanpa firewall server), sertifikat HTTPS, isian `.env.production`, akun awal, kunci pemulihan,
**salinan backup ke luar server** (NAS / cloud / HDD), pekerjaan rutin, update, pemulihan, troubleshooting, gladi
resik (18 uji), go-live, serah terima ke Tim IT, dan template berita acara. Konsep penitipan kunci ada di Bab 15.

### 19.3 Pekerjaan rutin
| Kegiatan | Caranya |
|---|---|
| Update aplikasi | `git pull` lalu `docker compose … up -d --build --force-recreate` (migrasi jalan otomatis; semua container memakai skrip & konfigurasi baru) |
| Backup manual | `docker compose … exec backup /bin/bash /scripts/backup.sh --now` |
| Salin backup ke luar server | Otomatis lewat cron (`scripts/backup-offsite.sh`); manual: `sudo bash scripts/backup-offsite.sh` |
| Restore | `bash scripts/restore.sh --db <db_….dump.age> [--uploads …]` — salah satu Direktur hadir untuk mengetik kata sandi pemulihan |
| Ganti kunci enkripsi | Ikuti `docs/08-INVENTARIS-DATA.md` §5.2 |
| Cek kesehatan | Buka `https://<domain>/api/health` |
| Lihat log | `docker compose … logs -f app` (atau `worker`, `db`, `proxy`) |
| Buka blokir login | Setting → User → buka blokir |
| Reset MFA | Setting → User → reset MFA (oleh Admin lain) |

> **Penting:** **gladi resik emulasi** (seluruh susunan produksi, termasuk backup, salinan ke NAS, dan pemulihan ke
> server kosong) sudah dijalankan 2026-10-22 dengan hasil **18/18 lulus** — lihat `docs/07-DEPLOYMENT.md` §13.6. Sebelum
> go-live, gladi singkat tetap diulang di server Ubuntu sungguhan (SSH, sertifikat & DNS kantor, SMTP & NAS asli, cron).

---

## 20. Panduan menambah fitur

> **Singkatnya:** baca dulu aturan bisnisnya, tulis service dan test-nya, baru buat tampilannya. Jangan lupa audit
> log, transaksi, dan pengecekan hak akses di server.

### 20.1 Checklist fitur baru
1. Cek kebutuhan di `docs/01-URD.md` dan aturan di `CLAUDE.md` / Tech Spec. Kalau ada yang tidak jelas, **tanyakan
   dulu** ke pemilik project.
2. Butuh tabel/kolom baru? Ubah `schema.prisma`, buat migrasi, jalankan `npx prisma generate`, dan tulis alasannya.
3. Buat aturan validasi (schema Zod) di `src/lib/validators/`, dengan pesan error berbahasa Indonesia.
4. Tulis service di `src/lib/services/`: terima koneksi database sebagai parameter, pakai transaksi bila mengubah lebih
   dari satu tabel, tulis audit log.
5. Tulis test: `*.test.ts` untuk logika murni, `*.db.test.ts` untuk yang menyentuh database.
6. Buat Server Action (5 langkah di §5.2) dan halamannya, memakai komponen bersama (`DataTable`, `FormField`, dll.).
7. Tambahkan menu di `nav-config.ts` bila perlu, dan pasang guard di halaman.
8. Jalankan `npm run lint && npm run typecheck && npm test`, perbarui dokumen, lalu serahkan untuk review.

### 20.2 Kasus khusus yang sering terlupa
| Kasus | Yang wajib dilakukan |
|---|---|
| Modul pengajuan baru | `nextDocumentNumber(tx, PREFIX)` + `buildApproval(tx, …)` di dalam transaksi; kirim notifikasi setelah commit; daftarkan efek di `approval-effects.ts` + data test di `src/test/entities.ts`; label di `lib/approval-modules.ts` |
| Kolom file baru | `assertFileKeyAvailable(tx, key, actorId)` + daftarkan di `services/upload.ts#referencedKeys` |
| Kolom data pribadi baru | Tambahkan ke daftar di `services/personal-data.ts` (seal/open) dan perbarui `docs/08` |
| Email baru | Template di `lib/mail/templates`, kirim lewat antrian (bukan langsung) |
| Job terjadwal baru | `worker/index.ts` (`createQueue` + `schedule` + `work`, zona `Asia/Jakarta`) |
| Memuat sesuatu dari domain luar | Daftarkan domainnya di `lib/security/csp.ts` |
| Butuh SQL mentah | Hanya `$queryRaw\`…\`` yang berparameter; versi `*Unsafe` ditolak lint |
| Menghapus data | Soft delete (`deletedAt`) dan filter `deletedAt: null` di semua query |

---

## 21. Troubleshooting & tanya-jawab

### 21.1 Masalah yang sering muncul
| Gejala | Penyebab paling umum | Solusi |
|---|---|---|
| Typecheck error "property … does not exist" setelah `git pull` | Prisma client belum diperbarui | `npx prisma generate` |
| "Cannot find module 'otpauth'" atau "'qrcode'" | Paket baru belum terpasang | `npm ci` |
| `P1001 Can't reach database` | Docker Desktop atau container database mati | Nyalakan Docker, lalu `docker compose up -d` |
| Email tidak terkirim | Worker tidak jalan, atau pengaturan SMTP salah | `npm run worker`; cek tabel `EmailLog` dan Mailpit (port 8025) |
| Login "terlalu banyak percobaan" | Batas percobaan login (15 menit) | Tunggu, atau Admin membuka blokir di Setting → User |
| HP authenticator hilang | — | Pakai kode cadangan, atau Admin lain me-reset MFA |
| `permission denied` dari database | Aplikasi (akun `oa_app`) mencoba mengubah struktur tabel | Ubah struktur hanya lewat migrasi Prisma; database lama: `npm run db:roles` |
| "DATA_ENCRYPTION_KEYS belum diisi" | Kunci belum ada di `.env` | `npm run keys:generate`, lalu salin ke `.env` |
| "Data terenkripsi tidak bisa dibuka" | Kunci salah, atau kunci lama terhapus dari daftar | Kembalikan kunci yang benar; kunci lama **jangan pernah dihapus** |
| `npm install` sangat lama (Windows) | Windows Defender memindai `node_modules` | Tambah pengecualian Defender; jangan menghentikan install di tengah jalan (file bisa rusak, perbaiki dengan `npm ci`) |
| `prisma migrate dev` menolak karena "non-interactive" | Dijalankan dari skrip atau agen | Pakai `migrate diff` (lihat §10.6) |
| Halaman error karena script/gambar diblokir | Sumber dari domain luar belum didaftarkan di CSP | Tambahkan di `lib/security/csp.ts` |

### 21.2 Tanya-jawab
**Kenapa Admin bisa melihat NIK semua karyawan tanpa disamarkan?**
Karena Admin adalah HRD dan Direktur yang memang bertugas mengelola data itu. Pemilik project memutuskan tidak memakai
masking. Sebagai gantinya, akun Admin dijaga ketat dengan MFA dan alarm.

**Kalau database dicuri, apakah data karyawan bisa dibaca?**
Kolom data pribadi terenkripsi, jadi pencuri hanya mendapat teks acak. Kolom yang tidak dienkripsi (nama, email,
jabatan, alamat) tetap terbaca; ini dicatat di `docs/08-INVENTARIS-DATA.md`.

**Bagaimana kalau kunci enkripsi hilang?**
Data terenkripsi tidak bisa dipulihkan. Karena itu salinan kunci dititipkan ke dua Direktur (Pak Rudy & Pak Leonard)
dengan prosedur di Bab 15.

**Kenapa email kadang telat beberapa detik?**
Karena email diantrekan dulu lalu dikirim oleh worker. Ini disengaja: aplikasi tidak perlu menunggu server email, dan
kalau server email sedang bermasalah, email dicoba ulang otomatis.

**Bisakah karyawan mengubah divisi atau jabatannya sendiri?**
Tidak. Data "Akun & Pekerjaan" hanya bisa diubah Admin, dan ini dicek di server.

**Kenapa nomor dokumen tidak berubah setelah pengajuan ditolak lalu direvisi?**
Supaya riwayatnya mudah dilacak: satu nomor untuk satu pengajuan, sejak pertama diajukan sampai selesai.

---

## 22. Catatan keputusan arsitektur (ADR)

> **Singkatnya:** ringkasan keputusan penting beserta alasannya, supaya penerus project tidak perlu menebak kenapa
> sesuatu dibuat seperti sekarang.

| # | Keputusan | Alasan | Konsekuensi |
|---|---|---|---|
| 1 | Next.js full-stack + Server Actions | Satu codebase, satu bahasa, cocok untuk tim kecil | Logika bisnis harus disiplin ditaruh di `services/` |
| 2 | Antrian job di PostgreSQL (pg-boss) | Tidak perlu Redis; cukup satu sistem untuk di-backup | Worker wajib jalan agar email terkirim |
| 3 | Snapshot approval per pengajuan | Mengubah alur tidak mengacaukan pengajuan yang berjalan | Data step disalin saat pengajuan dibuat |
| 4 | Soft delete untuk data utama | Data tidak hilang karena salah klik; jejak tetap ada | Semua query wajib menyaring `deletedAt` (pengecualian: file yatim) |
| 5 | Uang `BigInt`, tanggal `@db.Date`, zona WIB | Tidak ada pembulatan dan tanggal tidak bergeser | Konversi di batas server ke browser |
| 6 | Enkripsi kolom di lapisan service | Tipe kode tetap sederhana, hasil query berupa objek biasa, audit tidak menerima data terbuka | Kolom pribadi wajib dibaca/ditulis lewat `personal-data.ts` |
| 7 | Sidik jari NIK (HMAC) untuk cek unik | Bisa mengecek NIK ganda tanpa menyimpan NIK terbuka | Mengganti `DATA_INDEX_KEY` berarti menghitung ulang `nikHash` |
| 8 | Akun database terpisah, aplikasi tanpa hak mengubah struktur | Aplikasi yang dibobol tidak bisa menghapus tabel | Migrasi memakai `MIGRATE_DATABASE_URL`; skema `pgboss` milik `oa_app` |
| 9 | Audit log permanen | Jejak tidak bisa dihapus penyerang maupun aplikasi | User dengan riwayat audit hanya bisa dinonaktifkan |
| 10 | MFA wajib untuk semua akun (Staf sejak 2026-10-30) | Akun dengan akses terluas adalah sasaran utama; akun Staf juga memegang data pribadi & pengajuan uang | Perlu prosedur reset dan kode cadangan; semua karyawan butuh HP dengan aplikasi authenticator |
| 11 | Tanpa masking data pribadi di layar | Yang melihat hanya Admin (HRD & Direktur) yang berwenang | Pengamanan dialihkan ke MFA dan alarm |
| 12 | Modul Inventory ditunda lewat saklar | Prioritas bisnis | Kode & data tetap ada; aktifkan lewat `FEATURES.inventory` |
| 13 | Kunci pemulihan dibuat lewat aplikasi (kata sandi Direktur), bukan perintah `age` di laptop Direktur | Direktur tidak perlu menjalankan perintah teknis; petugas IT tetap tidak bisa membuka backup sendirian | Kata sandi pemulihan wajib kuat & diuji berkala; file kuncinya ikut setiap backup, bukan di database |
| 14 | Salinan backup ke luar server lewat skrip di host (rsync / rclone) | Tidak menambah container; mendukung NAS dan cloud sekaligus | Perlu cron & pemantauan; NAS memakai file penanda `.oa-offsite` |

---

## 23. Status, risiko & pekerjaan lanjutan

> **Singkatnya:** fitur utama sudah berjalan. Yang tersisa terutama persiapan sebelum aplikasi dipakai karyawan
> (go-live) dan beberapa keputusan dari pemilik project.

| Item | Status / catatan |
|---|---|
| Gladi resik stack produksi (backup/restore, container hanya-baca) | Emulasi **18/18 lulus** (2026-10-22, 4 temuan sudah ditindaklanjuti — docs/07 §13.6); ulangi singkat di server Ubuntu asli sebelum go-live |
| Salinan backup otomatis ke NAS/cloud | Skrip & panduan siap (`scripts/backup-offsite.sh`, `docs/07-DEPLOYMENT.md` §7); tempat tujuannya menunggu keputusan manajemen |
| `docs/07-DEPLOYMENT.md` | Sudah dibuat dan diuji lewat gladi resik emulasi (2026-10-22) |
| Masa simpan data kandidat yang ditolak & karyawan resign, DPIA, prosedur insiden PDP | Tahap 8 dilewati atas keputusan pemilik project (2026-10-21); data disimpan tanpa batas waktu sampai ada kebijakan |
| Antivirus ClamAV untuk upload | Opsional, belum |
| Divisi IT sebagai pemegang kunci enkripsi | Belum diputuskan |
| Enkripsi keterangan klaim kesehatan & alasan appeal | Tidak dipilih (bisa ditambah nanti) |
| CI otomatis, Dependabot, pentest | Tahap 10 (opsional) |
| Modul Laporan | Di luar scope versi ini |
| Inventory / Demo Unit | Ditunda (saklar fitur) |
| Bagian `02-TECH-SPEC.md` §2, §4.4, §6.3, §7 | Sebagian tertinggal dari aturan terbaru — `CLAUDE.md` §7 dan dokumen ini lebih mutakhir |
| Kondisi komputer developer per 2026-10-21 | Setelah menarik perubahan Tahap 5–7: jalankan `npm ci`, `npx prisma migrate deploy`, `npx prisma generate` sebelum test |

**Risiko utama dan cara meredamnya**

| Risiko | Peredam |
|---|---|
| Kunci enkripsi hilang → data pribadi tidak bisa dibuka | Titipan kunci di setiap backup, terkunci kata sandi pemulihan dua Direktur; uji tiap 3 bulan (Bab 15) |
| Server & backup lokal hilang bersamaan | Salinan harian ke NAS / cloud (`docs/07-DEPLOYMENT.md` §7) |
| Akun Admin dicuri | MFA wajib, alarm login gagal & akses massal, sesi pendek |
| Worker mati → email & job tertunda | Pantau log/healthcheck; pekerjaan tetap antre dan berjalan saat worker hidup lagi |
| Konfigurasi produksi berbeda di server asli | Gladi resik emulasi sudah lulus; gladi singkat di server Ubuntu asli sebelum go-live |
| Pengetahuan project hanya ada di tim intern | Dokumen ini, `CLAUDE.md`, dan dokumen di folder `docs/` sebagai bahan serah-terima |

---

## 24. Glosarium

| Istilah | Arti |
|---|---|
| **Server Action** | Fungsi di server yang dipanggil langsung dari form Next.js (pengganti API untuk mengubah data) |
| **Service** | Fungsi aturan bisnis di `src/lib/services`, bisa dites tanpa browser |
| **Approval Flow** | Aturan siapa menyetujui pengajuan per modul & divisi (bisa beberapa level) |
| **FALLBACK** | Alur cadangan bila semua level ter-skip (Ko Rudy / Ko Leonard) |
| **Soft delete** | Data ditandai `deletedAt`, tidak benar-benar dihapus |
| **Migrasi** | File SQL berisi perubahan struktur database, dijalankan berurutan |
| **pg-boss / worker** | Antrian pekerjaan di PostgreSQL & program yang menjalankannya |
| **Seed** | Data awal. Dev: data contoh (divisi, akun contoh, alur approval, master data). Produksi: hanya akun Admin sistem + aturan cuti |
| **Transaksi** | Sekumpulan perubahan database yang berhasil bersama atau gagal bersama |
| **CSP** | Content Security Policy — aturan browser tentang script apa saja yang boleh dijalankan |
| **MFA / TOTP** | Login dua langkah dengan kode 6 digit yang berganti setiap 30 detik |
| **Enkripsi AES-256-GCM** | Cara mengunci data; tanpa kunci isinya tidak terbaca, dan perubahan diam-diam ketahuan |
| **Sidik jari (blind index)** | Nilai HMAC dari NIK untuk mengecek NIK ganda tanpa menyimpan NIK terbuka |
| **age** | Alat enkripsi file untuk backup; dibuka dengan kunci pemulihan pemegang kunci |
| **Kata sandi pemulihan** | Kalimat rahasia yang dibuat Pak Rudy / Pak Leonard di Setting → Kunci Pemulihan; hanya dipakai saat server harus dipulihkan |
| **Kunci pemulihan** | Kunci `age` milik tiap pemegang kunci, disimpan dalam keadaan terkunci kata sandi pemulihan |
| **Titipan kunci data** | Salinan `DATA_ENCRYPTION_KEYS` & `DATA_INDEX_KEY` (`kunci-data.age`) yang ikut setiap backup, terkunci untuk para pemegang kunci |
| **Aturan 3-2-1** | 3 salinan data, di 2 jenis media, 1 di luar gedung — dasar salinan backup ke NAS / cloud |
| **NAS** | Network Attached Storage: perangkat penyimpanan di jaringan kantor, tempat salinan backup |
| **Role database** | Akun database dengan hak terbatas (`oa`, `oa_app`, `oa_backup`) |
| **Gladi resik** | Uji coba seluruh susunan server produksi sebelum dipakai sungguhan |
| **Go-live** | Saat aplikasi mulai dipakai karyawan secara resmi |
| **H-30** | 30 hari sebelum tanggal berakhir |
| **WIB** | Waktu Indonesia Barat (Asia/Jakarta) |

---

*Riwayat dokumen*
| Versi | Tanggal | Perubahan |
|---|---|---|
| 1.0 | 2026-10-21 | Versi pertama: merangkum kondisi kode setelah hardening Tahap 1–7 |
| 1.1 | 2026-10-21 | Penjelasan diperluas dengan gaya bertutur, contoh nyata per modul, alur pemakaian, tanya-jawab, dan tim penyusun (Attariq Shaquille & Nello Aurelius) |
| 1.2 | 2026-10-21 | Bab baru 15: pengelolaan & penitipan kunci enkripsi (jenis kunci, pemegang, langkah penitipan, membuka kembali, skenario darurat); bab sesudahnya bergeser menjadi 16–24 |
| 1.3 | 2026-10-21 | Bab 15 ditulis ulang: kunci pemulihan dibuat Direktur lewat aplikasi (kata sandi pemulihan), tanpa perintah teknis; salinan backup ke luar server & rujukan ke `docs/07-DEPLOYMENT.md`; ADR 13–14; konfigurasi, status, risiko, dan glosarium diperbarui |
| 1.4 | 2026-10-21 | Status hardening: Tahap 8 dilewati atas keputusan pemilik project; Tahap 9 dokumen deployment lengkap (tanpa firewall server, gladi resik 18 uji, serah terima) |
| 1.5 | 2026-10-22 | Gladi resik emulasi 18/18 lulus; update aplikasi memakai `--force-recreate`; status & risiko diperbarui |
| 1.6 | 2026-10-30 | MFA wajib untuk semua akun, termasuk Staf |
