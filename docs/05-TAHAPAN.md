# TAHAPAN PENGERJAAN — Office Automation System

Rincian `docs/PLAN.md` per tahap kecil. Setiap **Tahap** adalah satu titik henti:
Claude Code selesai mengerjakan satu tahap → lint, typecheck, dan test lulus → berhenti
dan melapor → user review & commit sendiri → baru lanjut ke tahap berikutnya.

**Cara pakai**
- Centang `[x]` item yang sudah selesai supaya progres terlihat di sesi berikutnya.
- Awali sesi dengan: *"Kerjakan Tahap X.Y dari docs/05-TAHAPAN.md"*.
- Bagian **Cek** adalah syarat tahap dianggap selesai.
- Satu fase tetap satu sesi (lihat `CLAUDE.md` §10); `/clear` antar fase.
- Tampilan mengikuti `docs/06-DESAIN-UI.md`; elemen di §5 dokumen itu tidak dibuat sebelum diputuskan user.

---

## Fase 0 — Setup Project ✅

### Tahap 0.1 — Konversi TypeScript & struktur folder
- [x] `app/` → `src/app/`, `.js` → `.tsx`, `tsconfig.json` strict, alias `@/*` → `./src/*`
- [x] `next.config.ts`, ESLint preset `core-web-vitals` + `typescript`

### Tahap 0.2 — Dependensi & tooling
- [x] Prisma 7 + `@prisma/adapter-pg` + `pg`, Zod, React Hook Form, date-fns(-tz)
- [x] shadcn/ui (Tailwind v4), Vitest, tsx
- [x] Script: `typecheck`, `test`, `worker`, `postinstall`

### Tahap 0.3 — Database
- [x] `src/lib/db.ts` (singleton PrismaClient + PrismaPg)
- [x] `docker compose up -d`, migrasi `init`
- **Cek:** [x] `npm run dev` 200 · [x] 34 tabel ada · [x] lint/typecheck/test lulus

---

## Fase 1 — Seed Data ✅

### Tahap 1.1 — Kerangka seed & user
- [x] `prisma/seed.ts` dijalankan lewat `tsx`, hash password `SEED_PASSWORD` (argon2)
- [x] Tambah `SEED_PASSWORD` ke `.env.example`
- [x] Upsert 5 Admin + `Employee`-nya: Yosep (ENGINEER), Darwin (SALES), Ika (UMUM), Rudy & Leonard (DIRECTOR)
- [x] `skipApproval = true` untuk Rudy & Leonard
- [x] Staf contoh per divisi: 1 Engineer, 1 Sales, Bu Devi (UMUM) — masing-masing dengan `EmploymentPeriod`
- **Cek:** [x] seed jalan 2× tanpa duplikat

### Tahap 1.2 — Master data
- [x] `LeavePolicy` 0/12/15/18 (0, 1–4, 5–14, 15+ — digeser 2026-10-02)
- [x] `AppSetting` `leave.maxCarryOver = 3`
- [x] `ReimburseType` (field `divisions[]`): Entertainment, Meals, Gift, Accommodation → SALES, UMUM, DIRECTOR; Transport, Allowance → ENGINEER, UMUM, DIRECTOR
- [x] `HealthCategory`: rawat jalan dokter, vitamin, kacamata
- **Cek:** [x] seed 2× tanpa duplikat · [x] seed tidak menimpa perubahan Admin di Setting

### Tahap 1.3 — Approval flow
- [x] REGULAR × (REIMBURSE, LEAVE, EXPENSE, REVENUE) × (ENGINEER, SALES, UMUM) sesuai Tech Spec §4.4
- [x] REGULAR HEALTH (division null) → Ika
- [x] FALLBACK → Rudy / Leonard
- [x] Tidak ada flow REGULAR untuk DIRECTOR (Rudy & Leonard selalu `skipApproval`)
- **Cek:** [x] 14 flow cocok dengan tabel §4.4 · [x] seed idempoten (run ulang = 0 flow baru)

---

## Fase 2 — Auth, Guard & Layout ✅

> Next 16: `middleware` sudah diganti `proxy` — baca `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` dan cek kompatibilitas Auth.js v5 sebelum mulai.

### Tahap 2.1 — Auth.js
- [x] Install `next-auth@beta`, `argon2` (fallback `bcryptjs` bila gagal build)
- [x] `src/lib/auth/` : config Credentials, `authorize` cek password + `User.isActive`
- [x] Callback JWT/session berisi `userId`, `role`, `employeeId`; augment tipe `next-auth`
- [x] Route handler `/api/auth/[...nextauth]`
- **Cek:** [x] login benar → session berisi role & employeeId · [x] password salah → ditolak · [x] user nonaktif → ditolak (`code=inactive`)

### Tahap 2.2 — Guard & proteksi route
- [x] `requireUser()`, `requireAdmin()` (redirect/403) untuk page & Server Action
- [x] `requireUser()` cek ulang `User.isActive` di DB, supaya sesi JWT user yang di-resign langsung tidak berlaku
- [x] `proxy.ts`: grup `(main)` wajib login → redirect `/login`
- [x] Audit log event LOGIN (diisi di Tahap 3.3)
- **Cek:** [x] Staf buka `/karyawan`, `/setting`, `/approval` → `/akses-ditolak` dari server · [x] akun dinonaktifkan saat sesi aktif → langsung ke `/login`

### Tahap 2.3 — Halaman login & layout
- [x] Tema shadcn (`globals.css`) & shell sidebar/topbar mengikuti `docs/06-DESAIN-UI.md` §1–2
- [x] `/(auth)/login` dengan RHF + Zod, pesan error Bahasa Indonesia
- [x] Layout `(main)`: sidebar responsif (HP & desktop), header user + logout
- [x] Menu sesuai `docs/04-MAPPING-MENU.md` (Admin vs Staf), halaman placeholder tiap route
- **Cek:** [x] menu sidebar berbeda Admin vs Staf · [x] logout berfungsi · [ ] pesan "akun nonaktif" di form login (uji manual oleh user)

---

## Fase 3 — Fondasi Bersama ✅

### Tahap 3.1 — Validator umum
- [x] `src/lib/validators/common.ts`: NIK/KK, NPWP, HP, email, nama, serial, nominal, rentang tanggal (Tech Spec §5)
- [x] Unit test valid & invalid tiap field, termasuk normalisasi (`08…` → `+62…`, `"1.250.000"` → 1250000)
- **Cek:** [x] 67 test valid & invalid untuk semua field

### Tahap 3.2 — Format & serialisasi
- [x] `src/lib/format.ts`: Rupiah `Rp 1.291.825`, tanggal Indonesia (Asia/Jakarta), NPWP, telepon
- [x] `serializeMoney` (BigInt → number di boundary server→client) + test
- **Cek:** [x] 22 test (Rupiah, tanggal WIB termasuk lewat tengah malam, NPWP, HP, serializeMoney bersarang)

### Tahap 3.3 — Audit log
- [x] `services/audit.ts`: `log({ actorId, action, entity, entityId, before, after })`
- [x] Bisa dipanggil di dalam `$transaction` (terima `tx`) + test
- [x] Login sukses tercatat sebagai LOGIN (`lastLoginAt` + audit dalam satu transaksi)
- **Cek:** [x] BigInt/Date aman di JSON · [x] `passwordHash` tidak pernah tercatat · [x] LOGIN muncul di tabel AuditLog

### Tahap 3.4 — Storage & akses file
- [x] `src/lib/storage/`: interface `put/get/delete` + `LocalStorage` (`UPLOAD_DIR`, nama UUID)
- [x] Validasi file: pdf/jpg/png via magic bytes, ≤ 5 MB
- [x] `next.config.ts`: `serverActions.bodySizeLimit = "6mb"` (default Next 1 MB); upload satu file per request
- [x] `/api/files/[key]`: izinkan Admin (termasuk approver), atau karyawan pemilik file
- **Cek:** [x] file > 5 MB / tipe lain (termasuk teks berekstensi .pdf) ditolak · [x] tanpa login 401, Staf lain 403, pemilik & Admin 200 · [x] path traversal 404

### Tahap 3.5 — Komponen reusable
- [x] Ikuti daftar komponen `docs/06-DESAIN-UI.md` §3 — `components/shared/`: PageHeader, StatCard, StatusBadge, EmptyState, ProgressBar, PersonCell (Tahap 2.3), FilterPills, FileChip, ApprovalStepper + `requestStatusBadge` (RMB-09)
- [x] `components/form/`: FormField, RupiahInput, DateInput, SelectField, FileUpload (+ `uploadFileAction`)
- [x] `components/table/`: DataTable (TanStack Table v9) dengan pencarian, sorting & paginasi
- [x] Tambah komponen shadcn yang dibutuhkan (select, table, tabs, dialog, textarea)
- **Cek:** [x] cek visual & interaksi (cari, sort, paginasi, input Rupiah, select) · [ ] upload via FileUpload diuji nyata di Tahap 4.4 (butuh login di browser)

---

## Fase 4 — Master Karyawan (EMP, DOC, CERT) ✅ (sisa: uji klik UI)

### Tahap 4.1 — Service & validator karyawan
- [x] `validators/employee.ts` memakai `common.ts` (+ BPJS TK 11 digit, BPJS Kes 13 digit, password min 8)
- [x] Schema: `employeeCreateSchema` (akun minimal + password awal dari Admin), `employeeAdminUpdateSchema` (semua field), `employeeSelfSchema` (data diri tanpa divisi/role/email/tanggal masuk-keluar)
- [x] `services/employee.ts`: createEmployee, updateByAdmin, updateSelf, resignEmployee, rehireEmployee — semua dalam transaksi + audit log
- [x] Test: staf mengirim `division`/`role`/`email`/tanggal masuk → dibuang; NIK/email duplikat → ditolak
- [x] Infrastruktur test database (`*.db.test.ts`, DB `office_automation_test`)
- **Cek:** [x] 13 test DB + 13 test schema lulus · [x] DB dev tidak tersentuh

### Tahap 4.2 — Daftar & form karyawan
- [x] `/karyawan` daftar aktif (cari, filter divisi, sort) + kartu statistik + distribusi divisi (desain 02)
- [x] `/karyawan/baru`: form akun minimal (nama, email, password awal, role, divisi, jabatan, tanggal masuk)
- [x] `/karyawan/[id]/edit`: Admin mengubah semua field termasuk divisi, role, email, tanggal masuk
- [x] Kolom kelengkapan data diri di daftar (persen + field yang belum diisi); kelengkapan dokumen menyusul di 4.4
- [x] Komponen form reusable: `components/form/fields.tsx` (TextInputField, SelectInputField, …), `useActionSubmit`, `EmployeeAccountSection` / `EmployeePersonalSections`
- **Cek:** [x] halaman 200 untuk Admin, Staf → `/akses-ditolak`, id salah → 404 · [ ] submit form Buat Akun & Simpan lewat UI (butuh login di browser pane)

### Tahap 4.3 — Detail karyawan & Resign
- [x] `/karyawan/[id]` dengan tab (`?tab=`) Data Diri / Keluarga / Dokumen / Sertifikat / Inventory / Riwayat Kerja — tab Keluarga, Dokumen (4.4), Sertifikat (4.5), Inventory (Fase 9) masih placeholder
- [x] Tombol Resign (dialog + tanggal keluar) → periode ditutup, status RESIGNED, akun nonaktif, audit
- [x] `/karyawan/arsip` + tombol "Aktifkan kembali" (Rehire, dialog + tanggal masuk baru)
- **Cek:** [x] resign pindah ke arsip, data tetap (DB test + cek halaman dengan data uji) · [x] rehire menambah `EmploymentPeriod` pada record lama (DB test) · [ ] klik Resign / Aktifkan kembali lewat UI (butuh login di browser pane)

### Tahap 4.4 — Keluarga & dokumen
- [x] CRUD `FamilyMember` (1 pasangan untuk status Menikah, anak bisa banyak); bagian keluarga hanya muncul jika status bukan Belum menikah
- [x] Upload dokumen per `DocumentType` (DOC-01, DOC-02; akte per anak) — `services/document.ts`, `dokumen-actions.ts`, komponen `DocumentSlot` / `PersonalDocumentsPanel` / `FamilyPanel` (dipakai ulang di Profil Saya)
- [x] Indikator kelengkapan dokumen (DOC-03) di daftar & detail — wajib: 9 dokumen pribadi; + surat nikah/cerai, KTP pasangan (Menikah), akte per anak
- [x] Keamanan: key file tidak bisa diklaim bila sudah dipakai data lain; ukuran & jenis dibaca ulang dari file di server
- **Cek:** [x] 9 DB test (akses, aturan keluarga, klaim file, hapus) + 5 unit test kelengkapan · [x] tab & daftar tampil benar dengan data uji (dibersihkan) · [ ] upload lewat UI (butuh login di browser pane)

### Tahap 4.5 — Sertifikat
- [x] CRUD sertifikat (jenis, nama, penerbit, nomor, terbit, berlaku sampai — kosong = seumur hidup, file opsional) — `services/certificate.ts`, `sertifikat-actions.ts`, `CertificatesPanel`
- [x] Status Aktif / Seumur hidup / Akan Kadaluarsa (≤ 30 hari, tampil "x hari lagi") / Kadaluarsa + test
- [x] Refactor: aturan akses & cek klaim file dipindah ke `services/access.ts`; `inspectStoredFile()` di `lib/storage`
- **Cek:** [x] 7 unit test status + 6 DB test (akses, klaim file, ganti/hapus file) · [x] tampil benar dengan data uji (dibersihkan)

### Tahap 4.6 — Profil Saya (Staf)
- [x] `/profil`: staf melengkapi data diri sendiri (EMP-06); email, role, divisi, tanggal masuk tampil read-only; kartu kelengkapan
- [x] `/profil/dokumen` (dokumen + keluarga), `/profil/sertifikat`, `/profil/inventory` (placeholder Fase 9) — tab bersama `ProfileShell`
- [x] Semua query & aksi memakai `employeeId` dari session
- **Cek:** [x] Staf hanya melihat datanya sendiri (Sinta tidak melihat sertifikat Andi) · [x] divisi/role/email/tanggal masuk dibuang schema staf (unit + DB test) · [ ] simpan form & upload lewat UI (butuh login di browser pane)

---

## Fase 5 — Approval Engine, Penomoran & Email ✅ (sisa: uji klik UI)

### Tahap 5.1 — Penomoran
- [x] `services/numbering.ts`: `INSERT … ON CONFLICT … RETURNING` di dalam transaksi
- [x] Format `PREFIX/YYYY/MM/NNNN`, reset per bulan (Asia/Jakarta)
- **Cek:** [x] 50 submit paralel → 50 nomor unik tanpa lompatan · [x] transaksi gagal tidak menghabiskan nomor

### Tahap 5.2 — Approval: build
- [x] `services/approval.ts#buildApproval`: skipApproval, flow REGULAR per module+division (fallback division null), SKIPPED, FALLBACK (step yang dilewati tetap tampil di snapshot)
- [x] Snapshot ke `ApprovalRequest` + `ApprovalRequestStep`; approver nonaktif tidak masuk snapshot
- [x] Unit test semua skenario pembentukan di Tech Spec §4.5 (memakai seed asli lewat `prisma/seed-lib.ts` + `src/test/seed.ts`)

### Tahap 5.3 — Approval: approve
- [x] `approveRequest()`: cek ADMIN aktif & approver step PENDING (selain itu `ForbiddenError`), lanjut step / final; update bersyarat mencegah approve ganda bersamaan
- [x] Efek final per modul: map eksplisit `services/approval-effects.ts` (diisi Fase 6–9)
- [x] Status REJECTED disiapkan tanpa UI — `TODO(OI-05)`
- [x] Unit test sisa skenario §4.5 (termasuk Darwin approve reimburse Engineer → 403) + balapan Rudy/Leonard
- **Cek:** [x] 20 DB test lulus

### Tahap 5.4 — Worker & email
- [x] `pg-boss` 12, `nodemailer` 8 (sesuai peer next-auth), `@react-email/components`; `worker/index.ts` nyata
- [x] Job `email.send` (retry 3× backoff eksponensial) + `EmailLog` (QUEUED → SENT / FAILED)
- [x] Template `approval-requested`, `approval-progress`, `approval-final` (`lib/mail/templates/approval-email.tsx`)
- [x] `enqueueApprovalNotifications()` dipanggil **setelah commit** transaksi; web hanya mengirim job (maintenance di worker)
- **Cek:** [x] email tampil di Mailpit — uji end-to-end submit → L1 → final: 9 email (approver, progres ke pemohon, final ke pemohon + 5 Admin), semua SENT

### Tahap 5.5 — Halaman Approval
- [x] `/approval`: tab Antrian Saya + Monitor Semua, filter per modul/status, stepper alur, kartu statistik (desain 01)
- [x] Aksi Setujui (dialog + catatan opsional) → engine → email di-enqueue; badge "N Pending" di sidebar (desktop & HP)
- **Cek:** [x] hanya approver step aktif yang melihat tombol Setujui; server tetap menolak yang lain (`ForbiddenError`, DB test) · [x] Staf → `/akses-ditolak` · [ ] klik Setujui lewat UI (butuh login di browser pane)

---

## Fase 6 — Reimburse (RMB) ✅ (sisa: uji klik UI)

### Tahap 6.1 — Service & validator
- [x] `validators/reimbursement.ts` (per baris: Date, Company, Project, Names–Position, Activities, Location, Type, Receipt, Payment By, Total) + `reimbursementTotals`
- [x] `services/reimbursement.ts`: simpan draft (nomor sementara `DRAFT-…`), total/subtotal Cash/CC dihitung di server, submit (nomor RMB + approval dalam satu transaksi), hapus draft
- [x] Company: pilih dari master Customer atau ketik baru → otomatis ditambahkan (keputusan user 2026-09-24); project menentukan customer
- [x] Efek final: status APPROVED + `approvedAt` (`approval-effects.ts`)
- **Cek:** [x] 9 DB test (total, tipe per divisi, akses pemohon, kwitansi wajib file, alur Engineer & Sales, Direktur auto-approve, nomor berurutan)

### Tahap 6.2 — Form multi-baris
- [x] `/reimburse/baru` & `/reimburse/[id]/edit`: baris dinamis (tambah/hapus), dropdown tipe sesuai divisi, datalist Company, pilihan project
- [x] Kwitansi Ya/Tidak + upload per baris (satu file per request); subtotal Cash, Kartu Kredit, Total tampil otomatis; Simpan Draft & Ajukan

### Tahap 6.3 — Daftar & detail
- [x] `/reimburse`: Admin semua pengajuan + draft sendiri, Staf milik sendiri; filter status Draft / Menunggu / Disetujui; kartu statistik (desain 03)
- [x] `/reimburse/[id]`: baris, subtotal, kwitansi, catatan, riwayat approval (stepper); Edit/Hapus/Ajukan hanya untuk pemohon saat DRAFT
- **Cek:** [x] alur Engineer → Yosep → Rudy dan Sales → Darwin → Leonard (DB test) + email (Fase 5) · [x] akses halaman & kwitansi benar dengan data uji (dibersihkan) · [ ] isi form & klik Ajukan lewat UI (butuh login di browser pane)

---

## Fase 7 — Cuti (LV) ✅ (sisa: uji klik UI)

### Tahap 7.1 — Setting cuti & kalender libur
- [x] `/setting/cuti`: kelola `LeavePolicy` (rentang masa kerja + jatah, divalidasi berurutan tanpa celah) & `leave.maxCarryOver`; berlaku untuk saldo periode baru
- [x] `/cuti/kalender`: libur nasional & kantor per tahun; Admin tambah satu / impor banyak ("YYYY-MM-DD Nama") / hapus; Staf hanya lihat

### Tahap 7.2 — Service perhitungan
- [x] `lib/leave.ts` (murni): masa kerja tahun penuh, jatah dari policy, `leaveYear` (tahun kalender + tanggal mulai boleh cuti), hari kerja tanpa Sabtu/Minggu/Holiday, sisa saldo, carry over
- [x] Sisa saldo = jatah + carry over − terpakai − pending; carry over dipakai lebih dulu, sisanya hangus (hanya sisa jatah yang dibawa)
- [x] OI-02 & OI-03 dijawab user (2026-09-24): periode = tahun kalender, cuti setelah genap 1 tahun (jatah penuh), naik tingkat mulai Januari, carry over berlaku setahun lalu hangus
- [x] Unit test masa kerja 0, 1, 5, 6, 15, 16 tahun; akhir pekan & libur tidak terhitung; 29 Feb

### Tahap 7.3 — Saldo & rollover
- [x] `ensureLeaveBalance` (dibuat saat dibutuhkan) + job `leave.rollover` harian 00:30 WIB di worker (`boss.schedule` tz Asia/Jakarta)
- [x] `/cuti/saldo`: jatah, carry over, terpakai, menunggu, sisa (Admin semua karyawan aktif, Staf sendiri)

### Tahap 7.4 — Pengajuan cuti
- [x] `/cuti`: kartu saldo, dialog "Ajukan Cuti" dengan pratinjau hari kerja, daftar pengajuan (Admin semua, Staf sendiri)
- [x] Submit via approval engine (nomor `LV/…`); ditolak jika melebihi saldo (pending ikut dihitung, baris saldo dikunci), bertabrakan, tanpa hari kerja, atau lintas periode
- [x] Efek final: status APPROVED + `LeaveBalance.used` bertambah (`applyApprovedLeave`)
- **Cek:** [x] saldo baru terpotong setelah APPROVED final (DB test) · [x] 2 pengajuan paralel tidak melewati saldo · [x] worker menjalankan rollover (8 saldo) · [x] halaman benar dengan data uji (dibersihkan) · [ ] ajukan lewat UI (butuh login di browser pane)

---

## Fase 8 — Kesehatan (HC) ✅ (sisa: uji klik UI)

### Tahap 8.1 — Setting plafon
- [x] `/setting/kesehatan`: plafon tahunan per karyawan per tahun (pilih tahun), tidak bisa di bawah klaim yang sudah diajukan
- [x] Plafon bulanan `floor(annual/12/10.000) × 10.000`, Desember = sisa — `TODO(OI-04)` (`lib/health.ts`)

### Tahap 8.2 — Service klaim & payout
- [x] `services/health.ts`: validasi sisa plafon tahunan (APPROVED + PENDING, baris plafon dikunci), invoice wajib & tidak bisa diklaim ulang
- [x] Jadwal `HealthPayout` saat approved (`health-payout.ts`), mulai bulan approval, limpahan ke bulan berikutnya — `TODO(OI-10)`, `TODO(OI-01)`
- [x] Unit test: klaim > plafon bulanan terbagi beberapa bulan; klaim > sisa tahunan ditolak; lintas tahun; klaim kedua di bulan yang sama

### Tahap 8.3 — Pengajuan & jadwal pembayaran
- [x] `/kesehatan`: kartu plafon (sisa, disetujui, menunggu, plafon & jadwal bulan ini), dialog klaim (kategori, tanggal, nominal, invoice wajib), daftar klaim + jadwal bayar
- [x] Approval Ika; klaim Ika → FALLBACK Rudy/Leonard (lewat engine)
- [x] `/kesehatan/pembayaran`: jadwal payout per bulan untuk Finance (Admin), total/dibayar/belum, tandai dibayar
- **Cek:** [x] 10 unit test + 9 DB test · [x] halaman & akses benar dengan data uji (dibersihkan) · [ ] ajukan klaim lewat UI (butuh login di browser pane)

---

## Fase 9 — Inventory, Project, Kandidat ✅ (sisa: uji klik UI) — Inventory DITUNDA 2026-09-25

### Tahap 9.1 — Inventory / Demo Unit
- [x] `/inventory`: CRUD aset (serial unik UPPERCASE, kategori, periode support, warranty) — `services/asset.ts`, `asset-queries.ts`, dialog & tabel, `/inventory/[id]`
- [x] Assign / kembalikan dengan riwayat `AssetAssignment`; tampil di tab Inventory karyawan & `/profil/inventory`
- **Cek:** [x] 5 DB test (serial unik, assign/kembalikan, riwayat) · [x] halaman tampil dengan data uji (dibersihkan) · [ ] klik lewat UI

### Tahap 9.2 — Customer & Project
- [x] `/project/customer`: master Customer & Project (Berjalan / New Acquisition)
- [x] `/setting/master`: tipe reimburse per divisi, kategori klaim — `services/master-data.ts`
- Asumsi: Staf melihat daftar/info project dan hanya baris reimburse miliknya, tanpa angka keuangan

### Tahap 9.3 — Expense & Revenue
- [x] `/project/[id]`: input Expense (CC/Cash) & Revenue via approval engine (`EXP/…`, `REV/…`); Revenue memakai field minimal — `TODO(OI-06)`
- [x] Total expense = Σ reimburse item APPROVED + Σ ProjectExpense APPROVED + test (`projectTotals`)
- **Cek:** [x] DB test project + approval/email (31 test) · [x] halaman tampil dengan data uji (dibersihkan)

### Tahap 9.4 — Kandidat
- [x] `/kandidat`: CRUD kandidat + dokumen (jenis dokumen pribadi + Lainnya/CV), status Melamar / Interview / Diterima / Ditolak, filter status — `services/candidate.ts`, `candidate-queries.ts`
- [x] Konversi kandidat Diterima → karyawan ("Jadikan Karyawan": divisi, jabatan, tanggal masuk, role, password awal; salin NIK & HP, pindah dokumen ownerType → EMPLOYEE); kandidat terkunci setelah dikonversi. `createEmployee` dipecah jadi `createEmployeeInTx` agar dipakai ulang
- **Cek:** [x] 4 DB test (konversi, NIK bentrok → arahkan ke Rehire, belum Diterima ditolak, terkunci) · [x] `/kandidat` & detail 200 untuk Admin, Staf → redirect · [ ] klik & upload lewat UI

---

## Fase 10 — Reminder, Dashboard & Hardening ✅ (sisa: uji klik UI)

### Tahap 10.1 — Reminder
- [x] Job `reminder.certificate` & `reminder.asset` harian 07:00 WIB (H-30), template `reminder-expiry` — `services/reminder.ts`, `mail/templates/reminder-email.tsx`
- [x] Sertifikat → karyawan pemilik + semua Admin; support/garansi unit → semua Admin (INV-04). Karyawan resign dilewati
- [x] Tabel `ReminderLog` (migrasi `reminder_log`): reminder sekali per item per tanggal berakhir; item yang tinggal < 30 hari tetap di-reminder bila worker sempat mati; tanggal diubah → reminder baru
- **Cek:** [x] 5 DB test · [x] uji worker nyata: 11 email reminder (sertifikat 6, garansi 5) tampil di Mailpit, status SENT (data uji dibersihkan)

### Tahap 10.2 — Dashboard
- [x] Dashboard Admin: kartu karyawan aktif / antrian approval (per modul) / project aktif / unit dipinjam, tabel antrian persetujuan (tombol Setujui), kalender libur & cuti pekan ini, daftar sertifikat & unit berakhir ≤ 30 hari — `services/dashboard-queries.ts`
- [x] Dashboard Staf: saldo cuti, plafon kesehatan, status 8 pengajuan terakhir (stepper), reminder (sertifikat akan/sudah kadaluarsa, dokumen belum lengkap), kalender pekan ini, tombol cepat Reimburse / Cuti / Klaim
- Tidak dibuat (06-DESAIN-UI §5): filter periode, unduh ringkasan, statistik anggaran/AI
- **Cek:** [x] 3 DB test · [x] `/dashboard` 200 untuk Admin & Staf dengan isi sesuai role

### Tahap 10.3 — Setting user & approval flow
- [x] `/setting/user`: daftar akun, ubah role, aktif/nonaktif, reset password (Admin mengetik password baru; tidak masuk audit). Tidak bisa ubah/nonaktifkan akun sendiri; karyawan resign diaktifkan lewat Arsip
- [x] `/setting/approval`: tambah/ubah flow per modul & divisi (level berurutan, beberapa approver per level), aktif/nonaktif, hapus; Fallback hanya bisa diubah step-nya. Approver harus Admin aktif; flow aktif modul+divisi unik
- [x] Pengaman: Admin yang menjadi **satu-satunya** approver aktif di suatu level flow, atau di pengajuan yang masih berjalan, tidak bisa dinonaktifkan / diturunkan ke Staf / di-resign sebelum flow diubah (`assertCanLoseApproverRights`, juga dipakai Edit Karyawan & Resign)
- **Cek:** [x] 9 DB test (termasuk pengajuan berjalan tetap snapshot lama setelah flow diubah) · [x] halaman 200 untuk Admin, Staf → redirect · [ ] klik lewat UI

### Tahap 10.4 — Keamanan
- [x] Rate limit login: maks 5 gagal per email / 15 menit (dicatat `LOGIN_FAILED` di AuditLog, tanpa tabel baru); saat terkunci password benar pun ditolak — `services/login-throttle.ts`
- [x] Review 50 Server Action: semua memanggil `requireUser`/`requireAdmin` sebelum proses (kecuali login/logout); aksi Staf memakai `employeeId` dari session / cek kepemilikan di service; semua page memanggil guard
- [x] Audit log: semua service yang menulis data mencatat audit (Customer baru dari form reimburse kini ikut tercatat); efek approval & job sistem tercakup audit APPROVE / proses sistem
- [x] Header keamanan (nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy), `X-Powered-By` dimatikan
- [x] Perbaikan: `src/proxy.ts` diekspor default (ekspor destructuring ditolak `next build`)
- **Cek:** [x] 2 DB test · [x] uji nyata: percobaan ke-6 → `code=rate_limited` (data uji dibersihkan) · [x] checklist Tech Spec §9 terpenuhi

### Tahap 10.5 — Produksi
- [x] `Dockerfile` multi-target: `app` (Next standalone, user non-root), `worker` (bundle esbuild `npm run build:worker`), `migrate` (`prisma migrate deploy` / `db seed`)
- [x] `docker-compose.prod.yml` (project `office-automation-prod`): db → migrate → app & worker, volume `uploads`, env dari `.env.production` (contoh: `.env.production.example`)
- [x] Service `backup` + `scripts/backup.sh`: `pg_dump` + arsip upload harian 01:00 WIB, retensi 14 hari, mode `--now` (NF-06)
- **Cek:** [x] build & `docker compose` produksi berjalan: migrasi & seed OK, login + 26 halaman 200 (Admin), Staf ter-redirect, header keamanan ada, worker siap & SMTP terjangkau, backup `--now` menghasilkan dump yang bisa dibaca `pg_restore` (stack uji, volume & image dihapus kembali)

---

## Fase 11 — Perubahan 2026-09-25: Absensi, aturan cuti, Inventory ditunda ✅ (sisa: uji klik UI)

### Tahap 11.1 — Inventory ditunda
- [x] `FEATURES.inventory = false` (`src/lib/features.ts`): menu & tab Inventory disembunyikan, `/inventory` & `/profil/inventory` 404, aksi ditolak di server, kartu unit & item unit di dashboard hilang, job `reminder.asset` tidak dijadwalkan (jadwal lama dihapus). Kode & data tetap
- **Cek:** [x] test dashboard menyesuaikan saklar · [x] `/inventory` 404, tab Inventory karyawan hilang

### Tahap 11.2 — Aturan cuti tahun pertama (LV-09)
- [x] Jatah tahun genap 1 tahun = 12 − bulan genap 1 tahun (bulan itu tidak dihitung): Feb → 10, Jan → 11, Des → 0 lalu penuh mulai Januari berikutnya; tahun-tahun berikutnya tetap per masa kerja per 1 Januari — `leaveYear().prorateMonths`, `yearEntitlement`, `firstUsableDate`
- [x] Saldo di DB dev dicek: semua sudah sesuai aturan baru (tidak ada yang perlu diubah)
- **Cek:** [x] unit test contoh user (Feb 2026 → 10 hari; Des 2026 → 0, Jan 2028 penuh) + DB test cuti diperbarui

### Tahap 11.3 — Absensi clock in / clock out (ATT-01..05)
- [x] Tabel `Attendance` (migrasi `attendance`), satu baris per karyawan per hari; jam dari server
- [x] `services/attendance.ts`: clock in (sekali/hari), clock out (update bersyarat, anti klik ganda), jam kerja di AppSetting, koreksi Admin (alasan wajib, audit); `attendance-queries.ts`: hari ini, riwayat bulan, rekap bulanan
- [x] `/absensi`: kartu Clock In/Out + jam berjalan, riwayat bulan & ringkasan; Admin: tab Rekap Karyawan (status hari ini + rekap bulan), `/absensi/[employeeId]` dengan koreksi / tambah absen; `/setting/absensi` jam kerja; menu Absensi (semua role); kartu absen di dashboard Admin & Staf
- **Cek:** [x] 7 unit test + 7 DB test · [x] halaman `/absensi`, rekap, detail, setting & dashboard 200 (Admin & Staf) · [ ] klik Clock In/Out lewat UI

---

## Fase 12 — Perubahan 2026-09-29: flow cuti & plafon kesehatan ✅

### Tahap 12.1 — Approval cuti hanya Ko Rudy
- [x] Seed: flow LEAVE satu untuk semua divisi (L1 Ko Rudy); flow LEAVE per divisi dihapus. Ko Rudy & Ko Leonard tetap otomatis disetujui (skipApproval)
- [x] DB dev: 3 flow cuti lama diganti 1 flow baru (tercatat di audit; tidak ada pengajuan cuti yang sedang berjalan)
- [x] Catatan: Ko Rudy kini satu-satunya approver cuti → pengaman approver menolak menonaktifkan/me-resign Ko Rudy sebelum flow cuti diubah
- **Cek:** [x] test approval, cuti, setting diperbarui (349 lulus)

### Tahap 12.2 — Plafon kesehatan per tahun
- [x] Plafon bulanan dihapus (migrasi `health_plafond_annual_only` menghapus kolom `monthlyAmount`); klaim disetujui dibayar penuh di bulan approval (satu `HealthPayout`)
- [x] UI: kartu plafon & Setting Kesehatan tidak lagi menampilkan plafon bulanan; OI-04 & OI-10 tidak berlaku
- **Cek:** [x] unit & DB test kesehatan diperbarui

---

## Fase 13 — Penyesuaian spesifikasi v1.14 (2026-09-29) ✅ (sisa: uji klik UI)

### Tahap 13.1 — Matriks persetujuan
- [x] Migrasi `v114_soft_delete_approval_rules`: hapus `Employee.skipApproval`; `ApprovalFlow.autoApproveWhenSkipped`; flow tanpa level = tanpa approval
- [x] Seed & DB dev disinkronkan: Reimburse/Expense/Revenue Umum & Direktur → Bu Ika (milik Bu Ika langsung disetujui); cuti Direktur tanpa approval; lainnya tetap. 3 pengajuan yang sedang berjalan tetap memakai alur lama (snapshot)
- [x] Setting → Approval Flow: opsi "Tanpa approval" & "Jika pemohon adalah approver-nya sendiri, langsung disetujui"

### Tahap 13.2 — Reimburse & kesehatan
- [x] 6 tipe reimburse untuk semua divisi (seed + DB dev); petunjuk Parkir → Allowance, bensin & tol → Transport
- [x] Klaim kesehatan: kolom `approvedAmount`; approver mengisi nominal disetujui di dialog Setujui (≤ diajukan); plafon & pembayaran memakai nominal disetujui; tabel klaim menampilkan keduanya

### Tahap 13.3 — Kalender, dokumen, project
- [x] Kalender: blok "Direktur cuti" untuk semua karyawan; dashboard Staf hanya menampilkan libur, cuti Direktur, dan cutinya sendiri
- [x] Dokumen ditampilkan per Kelompok I (identitas) & II (pendukung)
- [x] Selisih project (revenue − biaya) sudah ada sejak Fase 9, hanya untuk Admin

### Tahap 13.4 — Data tidak dihapus permanen
- [x] Soft delete (`deletedAt`) untuk dokumen, sertifikat, keluarga, kandidat, customer, libur, draft reimburse, approval flow, aset; file tidak lagi dihapus dari storage; semua query memfilter data terhapus; libur/customer yang dihapus dipulihkan bila ditambah lagi
- [x] Yang tetap diganti isinya saat diedit (tercatat di audit): level approval flow, tabel jatah cuti, baris draft reimburse
- **Cek:** [x] 359 test lulus (termasuk `v114.db.test.ts`) · [x] halaman utama 200 untuk Admin & Staf

---

## Fase 14 — Permintaan 2026-10-02 ✅ (sisa: GPS absensi ditunda, uji klik UI)

### 14.1 Sertifikat ✅
- [x] Sertifikat lewat verifikasi bertingkat: **Ko Yosep → Bu Ika** (sertifikat milik Ko Yosep: level 1 dilewati → Bu Ika). *Mengubah v1.14 "sertifikat tanpa approval"*
- [x] Label "Tanggal terbit" → "Tanggal diambil/lulus"; masa berlaku **opsional** untuk semua jenis (diubah 2026-10-06; sebelumnya wajib untuk sertifikat profesional)
- **Cek 14.1:** [x] migrasi `certificate_verification` (modul approval CERTIFICATE, nomor `CRT/…`, sertifikat lama = terverifikasi) · [x] terverifikasi → staf tidak bisa ubah (Admin bisa); hapus yang masih menunggu → verifikasi dibatalkan · [x] approver melihat ringkasan & file sertifikat di antrian · [x] 7 DB test · [ ] klik lewat UI

### 14.2 Karyawan & profil ✅
- [x] NIP boleh kosong saat karyawan baru dibuat; Bu Ika/Admin mengisinya belakangan dan langsung tampil di profil (cek alur & tampilan "belum ada NIP")
- [x] Daftar aset sederhana per karyawan di profil (nama barang, serial, tanggal terima, catatan) — **bukan** modul Inventory penuh (tetap ditunda)
- [x] Kontak darurat di profil karyawan (nama, hubungan, no HP)
- [x] Form biodata bisa di-download (PDF) dari profil karyawan — halaman cetak `/biodata/[id]` + "Cetak / Simpan PDF" (dialog print browser, tanpa library PDF)
- **Cek 14.2:** [x] migrasi `employee_emergency_assets` · [x] NIP hanya Admin (staf: read-only "Belum ada — diisi Admin") · [x] kontak darurat masuk kelengkapan data diri · [x] tab Karyawan → Aset (Admin) & Profil → Aset Saya · [x] biodata: pemilik & Admin saja · [x] 368 test lulus

### 14.3 Approval & role ✅
- [x] Sales: satu tingkat **Ko Darwin / Ko Leonard** (salah satu, adu cepat); Engineer tetap **Ko Yosep → Ko Rudy**
- [x] Reimburse divisi Umum → **Bu Ika / Ko Leonard** (salah satu); pemohon dikeluarkan dari levelnya sendiri (Darwin → Leonard, Ika → Leonard, Yosep → Rudy)
- [x] Bu Devi = karyawan biasa (Umum) tanpa peran approval/pencatatan — hapus penyebutan Bu Devi di dokumen approval
- [x] Approver bisa koreksi **nominal & keterangan** per baris (reimburse, klaim kesehatan, expense/revenue) sebelum menyetujui; setiap perubahan tercatat (sebelum → sesudah, oleh siapa) dan terlihat pemohon
- [x] Role baru **APPROVER**: akses seperti Staf (data sendiri) + halaman Approval untuk pengajuan yang ditugaskan; tanpa Karyawan/Setting
- [x] (2026-10-06) Koreksi approver diperluas: reimburse per baris (tanggal, company, project/New Acquisition, tipe, payment, nominal, lokasi, aktivitas, nama – jabatan, kwitansi), expense (tanggal, payment, nominal, keterangan), klaim (keterangan). Project dicek milik company
- [x] (2026-10-06) **Batalkan Approval** (ubah keputusan): persetujuan terakhir oleh orang (bukan otomatis), selama level berikutnya belum memutuskan, bisa dibatalkan oleh approver yang menyetujui atau Admin (bukan pemohon), alasan wajib. Step kembali PENDING (bisa dikoreksi & disetujui ulang); bila sudah final, efek modul dibatalkan (reimburse/expense/sertifikat/appeal → PENDING, saldo cuti dikembalikan, payout klaim dihapus — ditolak bila sudah dibayar). Tercatat di riwayat koreksi (`field = REVOKE`) + audit `REVOKE`; email ke approver level itu
- [x] (2026-10-06) Detail project: reimburse & expense langsung digabung jadi satu daftar **Biaya Project** (kolom Sumber: Reimburse / Expense Admin, urut tanggal); kartu jadi 2: Total biaya project (disetujui, rincian reimburse + expense) & Menunggu approval. Halaman daftar: "Total Biaya"
- [x] (2026-10-06) Total biaya project (kartu & kolom Total Biaya, kartu Menunggu approval) terlihat **semua karyawan**; daftar rinci expense Admin tetap khusus Admin, staf hanya melihat baris reimburse miliknya
- [x] (2026-10-06) Detail project: kolom Sumber → **Diajukan oleh** (pemohon reimburse / Admin penginput expense). Daftar project: **donut persentase biaya** (disetujui) per Project / per Customer — maks 7 irisan + "Lainnya", legenda = tabel nominal & persen, palet kategori tervalidasi CVD
- **Cek ubah approval:** [x] tanpa migrasi (pakai `ApprovalCorrection`) · [x] 4 DB test baru (koreksi multi-field + validasi, batalkan non-final, batalkan final reimburse, batalkan final cuti + saldo) · [x] 394 test lulus · [x] smoke `/approval` · [ ] klik Koreksi / Batalkan Approval lewat UI
- **Cek 14.3:** [x] migrasi `approver_role`, `approval_correction` · [x] DB dev: Darwin & Yosep → Approver, flow Sales/Umum diperbarui (tercatat di audit) · [x] test approval, koreksi, setting diperbarui · [x] halaman per role benar (Admin/Approver/Staf) · [ ] klik Koreksi & Setujui lewat UI
- [x] Pembagian role: **Admin** (kendali penuh) = Bu Ika, Ko Rudy, Ko Leonard; **Approver** = Ko Darwin, Ko Yosep (seed + DB dev). Engine approval & pengaman approver diubah agar approver boleh role ADMIN **atau** APPROVER

### 14.4 Invoice & retensi data ✅
- [x] Hapus upload invoice/kwitansi sepenuhnya dari reimburse & klaim kesehatan (form, validasi, tampilan)
- [x] Job purge (`invoice.purge`, harian 02:00 WIB): file invoice/kwitansi lama yang sudah tersimpan & berumur > 2 tahun dihapus dari storage (data nominal tetap) — pengecualian tertulis dari NFR "tidak dihapus permanen"
- **Cek 14.4:** [x] migrasi `health_invoice_optional` · [x] form reimburse & klaim tanpa upload ("Ada kwitansi fisik?" tetap sebagai info) · [x] worker memuat job purge; volume upload ikut di-mount ke worker produksi · [x] 364 test lulus

### 14.5 Reimburse ✅
- [x] Petunjuk tipe: Training → Allowance
- [x] Subtotal per tanggal transaksi di form & detail reimburse, lalu total pengajuan
- [x] Print / save as PDF reimburse, filter per orang & per bulan — `/cetak/reimburse?bulan=&karyawan=` (Admin pilih karyawan; lainnya hanya diri sendiri), form di halaman Reimburse
- [x] Project punya ID (`Project.code`, unik; project lama diberi `PRJ-0001…`); tampil sebagai "ID - Nama Project"
- [x] Form reimburse: Company wajib dipilih dulu, lalu dropdown "ID - Nama Project" hanya project milik company itu (dicek juga di server)
- [x] Form kunjungan → baris (permintaan 2026-10-05): tiap kunjungan = Tanggal + Company (dropdown, wajib dari master) + Project (dropdown milik company: Tanpa project / **New Acquisition (prospek)** / project); di dalamnya baris Tipe, Payment, Total, Lokasi, Names – Position, Aktivitas, kwitansi (tambah/hapus baris); "Tambah Kunjungan" untuk company/project/tanggal lain; subtotal per kunjungan + per tanggal + Cash/CC/Total. Draft lama dikelompokkan ulang otomatis saat diedit
- [x] Halaman Project: filter per customer; tombol Tambah Customer / Tambah Project untuk semua karyawan (permintaan 2026-10-05); staf hanya menambah (tidak mengubah/menghapus), project baru dari staf selalu aktif, ID project disarankan otomatis (PRJ-berikutnya). Di form reimburse: "+ Customer baru" / "+ Project baru" per kunjungan, langsung terpilih setelah disimpan
- [x] Revenue project dihapus (2026-10-05): stat Total revenue, kolom Revenue & Selisih, tombol/dialog/action Input Revenue, pilihan modul REVENUE di Setting Approval. Tabel & approval lama dibiarkan (tanpa migrasi destruktif)
- **Cek form kunjungan:** [x] migrasi `reimburse_new_acquisition` · [x] company tidak lagi dibuat otomatis dari form · [x] 3 test baru (master-only + New Acquisition, perataan kunjungan → baris, `itemsToVisits`) · [x] 389 test lulus · [x] smoke `/reimburse/baru` · [ ] klik isi & ajukan lewat UI
- **Cek 14.5:** [x] migrasi `project_code` · [x] 4 DB/unit test baru · [x] 372 test lulus · [x] halaman cetak: Staf tidak bisa membuka rekap orang lain · [ ] klik & cetak lewat UI

### 14.6 Cuti ✅
- [x] Filter/query cuti per bulan (`/cuti?bulan=`; cuti lintas bulan tampil di kedua bulan + ringkasan hari disetujui)
- [x] Kalender built-in tampilan bulan dengan blok highlight (cuti, libur, Direktur cuti) — komponen `LeaveCalendar`, di `/cuti/kalender`
- [x] "Pemutihan": Admin menyesuaikan saldo cuti karyawan secara manual (tambah/kembalikan hari) dengan alasan, tercatat di audit — `/cuti/saldo` (kolom Penyesuaian + tombol Sesuaikan + riwayat); saldo minus terbawa ke tahun berikutnya
- **Cek 14.6:** [x] migrasi `leave_adjustment` (`LeaveBalance.adjustment` + tabel `LeaveAdjustment`, juga dipakai potong cuti 14.7) · [x] unit test carry over minus + 4 DB test · [x] 381 test lulus · [ ] klik lewat UI

- [x] Kalender di dashboard (Admin & Staf) yang menandai hari ada karyawan cuti (highlight + keterangan nama/jenis). **Semua karyawan melihat cuti semua karyawan** (keputusan user 2026-10-02) — hapus pembatasan Staf di kartu "Kalender Libur & Cuti" dashboard

### 14.7 Absensi ✅ (GPS ditunda)
- [ ] ⏸ GPS (dalam/luar kantor) — **ditunda** (keputusan user 2026-10-02)
- [x] Tombol **Appeal** untuk satu hari tidak masuk (tidak bisa clock in): pilih alasan **Sakit** atau **Kunjungan keluar** + keterangan teks (tanpa lampiran). Diajukan untuk hari yang sudah lewat, maks 7 hari sejak tanggal tidak hadir
- [x] Appeal butuh approval **Bu Ika**; appeal milik Bu Ika → Ko Rudy / Ko Leonard (salah satu). Setelah disetujui, status hari itu berganti "Sakit" / "Kunjungan keluar" (bukan Tidak hadir)
- [x] Tidak hadir tanpa alasan: 7 hari sejak tanggal tidak hadir untuk appeal; lewat tanpa appeal yang disetujui → job harian memotong **1 hari saldo cuti** per hari (saldo boleh **minus**, mengurangi jatah berikutnya); tercatat di audit & riwayat absensi
- **Cek 14.7:** [x] migrasi `attendance_appeal` (modul approval ATTENDANCE_APPEAL, nomor `APL/…`) · [x] job `attendance.deduct` harian 01:00 WIB (hanya tanggal ≥ `AppSetting attendance.deductionStartDate` = hari pertama job berjalan; appeal menunggu tidak dipotong; sekali per tanggal) · [x] riwayat absensi: tombol Appeal, status Sakit / Kunjungan keluar / Appeal menunggu, "Saldo cuti dipotong"; rekap Admin + kolom Sakit, Kunjungan, Cuti dipotong · [x] 5 DB test · [x] 386 test lulus · [ ] klik Appeal & Setujui lewat UI
