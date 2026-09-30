@AGENTS.md

# CLAUDE.md — Office Automation System

Panduan kerja untuk Claude Code di repository ini. Baca file ini dulu di setiap sesi.

## 1. Tentang Project

Aplikasi web internal PT Artha Mitra Interdata untuk mengelola data karyawan dan
administrasi kantor: master karyawan (termasuk arsip resign), dokumen, sertifikat,
inventory/demo unit, reimbursement, cuti, klaim kesehatan, kandidat, serta
expense/revenue project. Semua pengajuan melewati approval berjenjang dengan
notifikasi email.

Dokumen acuan (WAJIB dirujuk sebelum membuat fitur):
- `docs/01-URD.md` — kebutuhan user (ID requirement: EMP-01, RMB-03, dst.)
- `docs/02-TECH-SPEC.md` — data model, aturan bisnis, validasi
- `docs/03-ARSITEKTUR.md` — lapisan aplikasi & struktur folder
- `docs/04-MAPPING-MENU.md` — menu & hak akses per role
- `docs/PLAN.md` — urutan pengerjaan per fase + kriteria selesai
- `docs/05-TAHAPAN.md` — rincian tiap fase per tahap kecil (checklist progres)
- `docs/06-DESAIN-UI.md` — acuan tampilan (gambar di `docs/design/`) + elemen desain yang belum disetujui

## 2. Tech Stack

- Next.js (App Router) + TypeScript (strict)
- PostgreSQL + Prisma 7 (`prisma-client` generator, output `src/generated/prisma`,
  koneksi via `@prisma/adapter-pg`, konfigurasi di `prisma.config.ts`)
- Auth.js v5 (next-auth@beta) — Credentials provider (email + password), session JWT
- Zod (validasi) + React Hook Form
- Tailwind CSS + shadcn/ui (style `base-nova`, berbasis Base UI — bukan Radix)
- TanStack Table **v9** (`useTable` + `tableFeatures`, bukan `useReactTable` v8). Pakai
  `DataTable` + `dataTableColumnHelper` dari `components/table/data-table.tsx`; panduan
  API ada di `node_modules/@tanstack/react-table/skills/`.
- pg-boss (antrian job & cron di PostgreSQL) — worker terpisah di `worker/`
- Nodemailer (SMTP) + React Email untuk template
- Vitest untuk unit test service layer
- Docker Compose untuk dev (Postgres + Mailpit)

Jangan menambah library besar lain (Redis, state manager global, UI kit lain)
tanpa bertanya ke user terlebih dahulu.

## 3. Perintah

```bash
docker compose up -d          # Postgres + Mailpit (UI email: http://localhost:8025)
npm run dev                   # Next.js
npm run worker                # pg-boss worker (email, reminder, saldo cuti) — WAJIB jalan agar email terkirim
npx prisma migrate dev        # buat & jalankan migrasi
npx prisma generate           # WAJIB setelah migrate (Prisma 7 tidak generate otomatis) (dev server otomatis memakai client baru, lihat src/lib/db.ts)
npx prisma db seed            # seed data awal
npx prisma studio             # lihat isi database
npm run lint && npm run typecheck && npm test   # WAJIB lulus sebelum selesai
npx vitest run --project unit   # hanya unit test (tanpa database)

# Produksi (Dockerfile + docker-compose.prod.yml; isi dulu .env.production dari .env.production.example)
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm migrate npx prisma db seed   # deploy pertama
```

## 4. Struktur Folder

```
src/
  app/
    (auth)/login/
    (main)/            # layout dengan sidebar, butuh login
      dashboard/ absensi/ profil/ karyawan/ kandidat/ inventory/ (ditunda)
      reimburse/ cuti/ kesehatan/ project/ approval/ setting/
    api/files/[key]/   # download file dengan cek hak akses (key = fileKey UUID)
  components/          # ui/ (shadcn), form/, table/, layout/
  lib/
    auth/              # config Auth.js, guard: requireUser, requireAdmin
    db.ts              # singleton Prisma client
    services/          # logika bisnis murni (approval, numbering, leave, health, employee)
    validators/        # schema Zod per modul
    storage/           # adapter file (local disk sekarang, S3 nanti)
    mail/              # template & fungsi enqueue email
    format.ts          # format Rupiah, tanggal, telepon, NPWP
  generated/prisma/    # hasil generate Prisma (jangan diedit)
worker/                # entry pg-boss worker
prisma/                # schema.prisma, migrations/, seed.ts
docs/
```

## 5. Aturan Coding

- Kode (nama variabel, fungsi, tabel) dalam **bahasa Inggris**; teks UI, pesan
  validasi, dan email dalam **Bahasa Indonesia**.
- Mutasi data lewat **Server Actions**. Setiap action: (1) cek session & role,
  (2) validasi Zod, (3) panggil service, (4) tulis AuditLog, (5) revalidatePath.
- **Otorisasi selalu dicek di server.** Menyembunyikan menu bukan pengamanan.
  STAFF hanya boleh membaca/mengubah data dengan `employeeId` miliknya.
- Logika bisnis ada di `src/lib/services/`, bukan di komponen atau action.
  Service harus bisa dites tanpa Next.js.
- Nominal uang: `BigInt` di DB. Jangan kirim BigInt ke Client Component —
  konversi di boundary (helper `serializeMoney`). Tampilkan `Rp 1.291.825`.
- Tanggal tanpa jam memakai `@db.Date`. Semua perhitungan tanggal dalam zona
  `Asia/Jakarta`.
- Operasi yang mengubah lebih dari satu tabel (submit + nomor + approval)
  wajib dalam `prisma.$transaction`.
- File upload: PDF/JPG/PNG, maks 5 MB, disimpan dengan nama UUID, diakses
  hanya lewat `/api/files/[key]` yang mengecek hak akses. Upload lewat
  `saveUpload()` di `lib/storage` (validasi magic bytes + simpan). Satu request =
  satu file (batas body Server Action 6 MB di `next.config.ts`); form dengan banyak
  lampiran (mis. kwitansi per baris reimburse) meng-upload file satu per satu.
- Email **tidak pernah dikirim langsung** dari request — selalu enqueue ke pg-boss.
- Modul pengajuan (Reimburse, Cuti, Kesehatan, Expense/Revenue): di dalam `$transaction`
  submit panggil `nextDocumentNumber(tx, prefix)` + `buildApproval(tx, …)`; SETELAH commit
  panggil `enqueueApprovalNotifications(prisma, result.notifications)`. Efek saat APPROVED
  final didaftarkan di `services/approval-effects.ts` (map eksplisit per modul). Saat menambah
  efek modul baru, tambahkan juga pembuat entitasnya di `src/test/entities.ts` (dipakai test
  approval & email), kalau tidak test engine gagal karena entitas tidak ada.
- Seed ada di `prisma/seed-lib.ts` (dipakai juga test lewat `src/test/seed.ts#resetAndSeed`).

## 6. Validasi Format Input (EMP-02)

Satu schema Zod dipakai di client dan server. Normalisasi sebelum simpan.

| Field | Aturan |
|---|---|
| NIK, No KK | tepat 16 digit angka; NIK unik |
| NPWP | 15 atau 16 digit angka, simpan tanpa titik/strip |
| No HP | normalisasi ke `+62…` (terima `08…`, `62…`, `+62…`), 10–15 digit |
| Email | valid, simpan lowercase |
| Nama | trim, spasi ganda dihapus, Title Case |
| Serial number | trim, UPPERCASE, unik |
| Nominal | integer > 0, tanpa desimal |
| Rentang tanggal | end ≥ start |

## 7. Aturan Bisnis Kunci (ringkas — detail di docs/02-TECH-SPEC.md)

**Role:** `ADMIN` (lihat & kelola semua data + Setting) dan `STAFF` (hanya data
sendiri). Divisi (SALES / ENGINEER / UMUM / DIRECTOR) disimpan di `Employee.division` dan
menentukan tipe reimburse serta approval flow. Admin: Ko Yosep (Engineer), Ko Darwin (Sales),
Ci Ika (Umum), Ko Rudy & Ko Leonard (Direktur).
Hak approve ditentukan oleh **Approval Flow**, bukan oleh role saja.

**Approval (dipakai Reimburse, Cuti, Kesehatan, Expense/Revenue):**
1. Ambil flow REGULAR sesuai `module` + `division` pemohon (division null = semua).
2. Flow tanpa level → langsung APPROVED (mis. cuti divisi Direktur).
3. Step yang approver-nya mencakup pemohon sendiri → SKIPPED.
4. Jika semua step ter-skip → langsung APPROVED bila flow `autoApproveWhenSkipped`, selain itu flow FALLBACK.
5. Step berurutan; step dengan beberapa approver = salah satu cukup.
6. Step terakhir yang disetujui = APPROVED (final).
(`skipApproval` per karyawan sudah dihapus di v1.14.)

Flow awal (seed, matriks v1.14):
| Module | Divisi | L1 | L2 | Catatan |
|---|---|---|---|---|
| REIMBURSE, EXPENSE, REVENUE | SALES | Ko Darwin | Ko Leonard | |
| REIMBURSE, EXPENSE, REVENUE | ENGINEER | Ko Yosep | Ko Rudy | |
| REIMBURSE, EXPENSE, REVENUE | UMUM | Bu Ika | — | autoApproveWhenSkipped (milik Bu Ika langsung disetujui) |
| REIMBURSE, EXPENSE, REVENUE | DIRECTOR | Bu Ika | — | |
| LEAVE (cuti) | semua | Ko Rudy | — | |
| LEAVE (cuti) | DIRECTOR | — | — | tanpa approval, tampil "Direktur cuti" di kalender |
| HEALTH | semua | Bu Ika | — | milik Bu Ika → Fallback |
| FALLBACK | — | Ko Rudy / Ko Leonard | — | |

**Email:** submit → approver step aktif; approve non-final → approver berikutnya
+ info ke pemohon; approve final → pemohon + semua Admin.

**Nomor dokumen:** `PREFIX/YYYY/MM/NNNN` (RMB, LV, HC, EXP, REV), counter per
bulan via `NumberSequence` dengan row lock di dalam transaksi.

**Cuti:** periode = **tahun kalender** (Jan–Des, cutoff 31 Des). Cuti bisa dipakai setelah
genap 1 tahun masa kerja. Tahun genap 1 tahun: jatah prorata = 12 − bulan genap 1 tahun (masuk Feb → 10 hari,
masuk Des → 0, baru dapat Januari berikutnya). Tahun-tahun berikutnya jatah menurut masa kerja per 1 Januari:
1–5 th = 12, 6–15 th = 15, >15 th = 18 (tabel `LeavePolicy`). Carry over maks 3 hari
(`AppSetting leave.maxCarryOver`), berlaku sepanjang tahun berikutnya lalu hangus. Hari cuti = hari kerja
(tanpa Sabtu, Minggu, `Holiday`).

**Kesehatan:** plafon **hanya tahunan** per karyawan per tahun (tidak ada plafon bulanan). Klaim >
sisa plafon tahunan ditolak saat submit. Approver mengisi nominal disetujui (≤ diajukan, `approvedAmount`);
plafon & pembayaran memakai nominal disetujui. Klaim approved dibayar penuh: satu `HealthPayout` di bulan approval.

**Hapus data = soft delete** (`deletedAt`, NFR v1.14): Document, Certificate, FamilyMember, Candidate, Customer,
Holiday, Reimbursement (draft), ApprovalFlow, Asset. Setiap query WAJIB memfilter `deletedAt: null` (termasuk
include relasi); file di storage tidak dihapus. Tambah ulang libur/customer yang pernah dihapus → dipulihkan.
Reimburse: 6 tipe untuk semua divisi. Dokumen: Kelompok I & II (`DOCUMENT_GROUP_I/II`).

**Isi data mandiri:** Admin hanya membuat akun minimal (nama, email, divisi,
jabatan, tanggal masuk, role); staf melengkapi sendiri data diri, keluarga, dokumen,
sertifikat. Divisi, role, email, dan tanggal masuk/keluar hanya boleh diubah
Admin (dicek di server).
`nik` & `employeeNo` nullable. Seed tidak mengisi data diri.

**Reminder H-30:** job worker `reminder.certificate` & `reminder.asset` (07:00 WIB). Dicatat di
`ReminderLog` (sekali per item per tanggal berakhir). Sertifikat → karyawan + Admin; unit → Admin.

**Pengaman approver:** Admin yang menjadi satu-satunya approver aktif di level flow aktif / pengajuan
berjalan tidak bisa dinonaktifkan, diturunkan ke Staf, atau di-resign (`assertCanLoseApproverRights`).

**Login:** maks 5 gagal per email / 15 menit (`LOGIN_FAILED` di AuditLog).

**Absensi:** clock in / clock out oleh tiap karyawan, jam dari server (WIB), satu baris `Attendance` per
karyawan per hari. Terlambat / pulang cepat terhadap jam kerja `AppSetting attendance.workHours`
(default 08:00–17:00), tidak dihitung di akhir pekan & libur. Admin mengoreksi dengan alasan wajib (audit).

**Modul ditunda:** Inventory / Demo Unit (`FEATURES.inventory = false` di `src/lib/features.ts`) —
menu, halaman, aksi, dashboard & job `reminder.asset` nonaktif; kode & data tetap ada.

**Resign/Rehire:** tombol Resign mengisi `endDate` periode aktif dan status
RESIGNED (data tidak dihapus). Rehire dari halaman Arsip ("Aktifkan kembali") →
pakai record lama + `EmploymentPeriod` baru. NIK dipakai orang lain → ditolak.

## 8. Di Luar Scope (JANGAN dibuat)

Tools testing skill karyawan, fitur mutasi/tracking mutasi, modul laporan.

## 9. Open Issue & Asumsi

Bagian yang requirement-nya belum final ditandai `// TODO(OI-xx): ...` di kode,
sesuai tabel Open Issue di `docs/01-URD.md`. Jangan mengarang aturan baru di luar
asumsi yang tertulis; jika menemukan kebutuhan yang tidak ada di docs, **berhenti
dan tanyakan ke user**.

## 10. Cara Kerja

- Kerjakan **satu fase `docs/PLAN.md` per sesi**. Mulai dengan rencana singkat,
  tunggu persetujuan user, baru implementasi.
- Di dalam fase, kerjakan **per tahap** sesuai `docs/05-TAHAPAN.md`. Setelah satu
  tahap selesai (lint/typecheck/test lulus), centang item-nya lalu **berhenti** dan
  laporkan. User yang review & commit — jangan `git commit`/push sendiri.
- Jangan mengubah `prisma/schema.prisma` tanpa membuat migrasi dan menjelaskan
  alasannya.
- Sebelum menyatakan selesai: lint, typecheck, dan test harus lulus, lalu
  cocokkan dengan "Kriteria Selesai" fase tersebut.
- Tulis unit test untuk setiap service di `src/lib/services/`. Service yang menulis ke
  database dites dengan PostgreSQL sungguhan: file `*.db.test.ts`, helper `src/test/db.ts`
  (`testDb`, `resetDb`, `createTestEmployee`). DB test = `TEST_DATABASE_URL` (nama wajib
  berakhiran `_test`), dibuat ulang otomatis oleh `vitest.db-setup.ts` — DB dev tidak disentuh.
