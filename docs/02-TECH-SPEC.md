# TECHNICAL SPECIFICATION — Office Automation System

Versi 0.2 · Acuan requirement: `01-URD.md` · Skema database: `prisma/schema.prisma`

## 1. Tech Stack

| Layer | Teknologi | Catatan |
|---|---|---|
| Framework | Next.js (App Router), TypeScript strict | Server Components + Server Actions |
| Database | PostgreSQL 17 | |
| ORM | Prisma 7 | Generator `prisma-client`, driver adapter `@prisma/adapter-pg` |
| Auth | Auth.js v5 (next-auth@beta) | Credentials provider, session JWT, role di token |
| Hash password | argon2 (atau bcryptjs jika argon2 gagal build) | |
| Validasi | Zod | Schema sama untuk client & server |
| Form | React Hook Form + @hookform/resolvers | |
| UI | Tailwind CSS + shadcn/ui, tabel dengan TanStack Table | |
| Job & scheduler | pg-boss | Queue di PostgreSQL; tidak perlu Redis |
| Email | Nodemailer + React Email | Dev: Mailpit |
| Tanggal | date-fns + date-fns-tz | Zona Asia/Jakarta |
| Test | Vitest | Fokus service layer |

## 2. Model Data

Skema lengkap ada di `prisma/schema.prisma`. Ringkasan:

| Kelompok | Model |
|---|---|
| Auth | `User` (role ADMIN/STAFF, relasi 1–1 ke Employee) |
| Karyawan | `Employee`, `EmploymentPeriod`, `FamilyMember`, `Document`, `Certificate` |
| Inventory | `Asset`, `AssetAssignment` |
| Project | `Customer`, `Project`, `ProjectExpense`, `ProjectRevenue` |
| Reimburse | `ReimburseType`, `Reimbursement`, `ReimbursementItem` |
| Cuti | `LeavePolicy`, `LeaveBalance`, `LeaveRequest`, `Holiday` |
| Kesehatan | `HealthCategory`, `HealthPlafond`, `HealthClaim`, `HealthPayout` |
| Kandidat | `Candidate` (+ `Document`) |
| Approval | `ApprovalFlow`, `ApprovalFlowStep`, `ApprovalStepApprover`, `ApprovalRequest`, `ApprovalRequestStep` |
| Sistem | `NumberSequence`, `AppSetting`, `AuditLog`, `EmailLog` |

Keputusan desain:
- **Uang** disimpan `BigInt` (IDR tanpa desimal). Dikonversi ke `number` di boundary server→client.
- **Tanggal tanpa jam** memakai `@db.Date`.
- **Status karyawan** di `Employee.status`; tanggal masuk/keluar di `EmploymentPeriod` sehingga rehire menambah periode baru.
- **Approval** disimpan sebagai snapshot per pengajuan (`ApprovalRequest` + steps), sehingga perubahan mapping tidak memengaruhi pengajuan yang sedang berjalan.

## 3. Penomoran Dokumen

Format `PREFIX/YYYY/MM/NNNN`, counter reset per bulan.

| Prefix | Modul |
|---|---|
| RMB | Reimburse |
| LV | Cuti |
| HC | Klaim Kesehatan |
| EXP | Expense Project |
| REV | Revenue Project |

Implementasi (`services/numbering.ts`): di dalam transaksi, `INSERT ... ON CONFLICT
(prefix, year, month) DO UPDATE SET "lastValue" = "lastValue" + 1 RETURNING "lastValue"`.
Satu statement atomik sehingga tidak ada nomor ganda. Nomor dibuat saat **submit**,
bukan saat draft (draft memakai nomor sementara `DRAFT-<id>`).

## 4. Approval Engine (`services/approval.ts`)

### 4.1 Pembentukan approval saat submit
```
function buildApproval(module, requester):
  if requester.employee.skipApproval:
      return APPROVED langsung (tanpa step)
  flow = cari ApprovalFlow REGULAR, module = module,
         division = requester.division (atau division null)
  steps = flow.steps urut level
  tandai step SKIPPED jika requester.userId ∈ step.approvers
  if semua step SKIPPED:
      steps = ApprovalFlow FALLBACK
  step aktif pertama → PENDING, sisanya WAITING
  status request = PENDING, currentLevel = level step aktif
```

### 4.2 Aksi approve
1. Validasi: user ADMIN **dan** userId ∈ `approverIds` step PENDING. Selain itu → 403.
2. Step → APPROVED (actedBy, actedAt, note).
3. Ada step WAITING berikutnya → jadikan PENDING, email ke approver-nya + info ke pemohon.
4. Tidak ada → request & entitas APPROVED, jalankan **efek final** per modul, email ke pemohon + semua Admin.

Semua langkah dalam satu transaksi; email di-enqueue setelah commit.

### 4.3 Efek final per modul
| Modul | Efek saat APPROVED |
|---|---|
| REIMBURSE | set `approvedAt` |
| LEAVE | tambah `LeaveBalance.used` |
| HEALTH | buat jadwal `HealthPayout` (§6.3) |
| EXPENSE / REVENUE | set status APPROVED |

### 4.4 Seed flow awal
| Scope | Module | Divisi | Level 1 | Level 2 |
|---|---|---|---|---|
| REGULAR | REIMBURSE, LEAVE, EXPENSE, REVENUE | ENGINEER | Yosep | Rudy |
| REGULAR | REIMBURSE, LEAVE, EXPENSE, REVENUE | SALES | Darwin | Leonard |
| REGULAR | REIMBURSE, LEAVE, EXPENSE, REVENUE | UMUM | Rudy / Leonard | — |
| REGULAR | HEALTH | (semua) | Ika | — |
| FALLBACK | — | — | Rudy / Leonard | — |

`skipApproval = true`: Rudy, Leonard (divisi DIRECTOR). Tidak ada flow REGULAR untuk DIRECTOR karena
semua direktur auto-approve; bila flow REGULAR tidak ditemukan, engine melempar error (jangan menebak flow).

### 4.5 Skenario uji wajib (unit test)
| Pemohon | Modul | Hasil |
|---|---|---|
| Staf Engineer | REIMBURSE | L1 Yosep → L2 Rudy |
| Yosep | LEAVE | L1 skipped → Rudy |
| Staf Sales | REIMBURSE | Darwin → Leonard |
| Darwin | REIMBURSE | skipped → Leonard |
| Rudy | apa pun | langsung APPROVED |
| Bu Devi (Umum) | REIMBURSE | Rudy/Leonard (salah satu) |
| Bu Devi | HEALTH | Ika |
| Ika | HEALTH | skipped → FALLBACK Rudy/Leonard |
| Ika | LEAVE | Rudy/Leonard |
| Darwin coba approve reimburse Engineer | — | ditolak 403 |

## 5. Standar Validasi Input (`lib/validators/common.ts`)

| Field | Aturan | Normalisasi |
|---|---|---|
| NIK, No KK | `^\d{16}$` | hapus spasi |
| NPWP | 15 atau 16 digit | hapus `.` dan `-`; tampil `99.999.999.9-999.999` (15 digit) |
| No HP | 10–15 digit | `08…` / `62…` → `+62…` |
| Email | format email | lowercase, trim |
| Nama | 2–100 karakter | trim, rapikan spasi, Title Case |
| Serial number | 3–50 karakter | trim, UPPERCASE |
| BPJS Ketenagakerjaan | 11 digit | hapus spasi *(keputusan user 2026-09-24)* |
| BPJS Kesehatan | 13 digit | hapus spasi *(keputusan user 2026-09-24)* |
| Password | 8–100 karakter | — |
| Nominal | integer > 0 | terima input "1.250.000" → 1250000 |
| Tanggal | ISO date | end ≥ start |
| File | pdf/jpg/png, ≤5 MB | cek magic bytes, bukan hanya ekstensi |

## 6. Logika Bisnis

### 6.1 Karyawan
- **Resign** (`services/employee.ts#resign`): isi `endDate` periode aktif, `endReason = "RESIGN"`, `Employee.status = RESIGNED`, `User.isActive = false`, audit log.
- **Buat akun** (`services/employee.ts#createEmployee`, Admin): field wajib hanya nama, email, divisi, jabatan, tanggal masuk, role, dan **password awal yang diketik Admin** (diberikan ke staf; keputusan user 2026-09-24) → buat `Employee` + `EmploymentPeriod` + `User`. `nik` & `employeeNo` boleh kosong (diisi belakangan).
- **Isi data mandiri** (EMP-06): staf mengubah data dirinya sendiri lewat `/profil`. Field yang **hanya Admin** boleh ubah: `division`, `User.role`, `email`, `EmploymentPeriod.startDate/endDate` (menentukan jatah cuti), plus field sistem (`status`, `skipApproval`). Dicek di server (schema Zod terpisah untuk staf vs Admin), bukan hanya disembunyikan di form.
- **NIK unik**: bila NIK yang diisi sudah dipakai karyawan lain → tolak dengan pesan "NIK sudah terdaftar, hubungi Admin". Email & nomor karyawan juga unik.
- **Pengaman Admin**: Admin tidak bisa mengubah role akunnya sendiri dan tidak bisa me-resign dirinya sendiri (mencegah terkunci dari aplikasi).
- **Rehire**: dari `/karyawan/arsip`, Admin klik "Aktifkan kembali" → status ACTIVE, `EmploymentPeriod` baru (tanggal masuk diisi Admin), akun aktif, audit log REHIRE.
- **Konversi kandidat**: salin data & pindahkan dokumen (ownerType → EMPLOYEE).

### 6.2 Cuti
- **Periode cuti = tahun kalender** (1 Jan – 31 Des) *(OI-03 terjawab)*. `LeaveBalance.periodStart` = 1 Jan, atau tanggal masuk bila masuk/rehire di tahun itu.
- Cuti baru bisa dipakai setelah **genap 1 tahun** masa kerja (`firstAnniversary`). Contoh: masuk 10 Feb 2026 → bisa cuti mulai 10 Feb 2027, jatah 12, cutoff 31 Des 2027; 1 Jan 2028 saldo baru + carry over.
- Jatah = `LeavePolicy` untuk masa kerja (tahun penuh) **per 1 Januari**; di tahun kalender saat genap 1 tahun, masa kerja dianggap 1 tahun (jatah penuh, tidak proporsional). Kenaikan tingkat berlaku mulai Januari berikutnya.
- Saldo dibuat saat dibutuhkan dan oleh job harian pg-boss `leave.rollover`: `carriedOver = min(sisa jatah tahun lalu, AppSetting leave.maxCarryOver = 3)`, berlaku sepanjang tahun lalu hangus *(OI-02 terjawab)*.
- `workingDays` = hari dalam rentang − Sabtu/Minggu − `Holiday`.
- Submit ditolak jika sebelum genap 1 tahun masa kerja, melewati 31 Des, atau `workingDays > entitlement + carriedOver − used − (pending lain)`.
- Carry over dipakai lebih dulu sebelum jatah periode berjalan.

### 6.3 Kesehatan
- `HealthPlafond` per karyawan per tahun, diisi Admin.
- `monthlyAmount` *(TODO OI-04)*: `floor(annual / 12 / 10.000) × 10.000`; bulan Desember = `annual − 11 × monthly`.
- Submit ditolak jika amount > plafon tahunan − total klaim APPROVED/PENDING tahun itu.
- Saat approved, jadwalkan payout: mulai bulan approval, isi tiap bulan maks `monthlyAmount − payout lain di bulan itu`, sisa ke bulan berikutnya *(TODO OI-10: lintas tahun)*.
- Tidak ada carry over plafon *(TODO OI-01)*.

### 6.4 Reimburse
- Dropdown tipe difilter `ReimburseType.divisions has divisi pemohon`. Seed: Sales → 4 tipe Sales;
  Engineer → Transport, Allowance; Umum & Direktur → keenam tipe.
- Total dihitung server-side dari item (jangan percaya nilai dari client).
- Minimal 1 item untuk submit; hanya DRAFT yang bisa diedit/dihapus pemohon.

### 6.5 Project
- Total expense project = Σ `ReimbursementItem` APPROVED dengan projectId + Σ `ProjectExpense` APPROVED.

## 7. Notifikasi & Job (pg-boss, `worker/`)

| Job | Jadwal | Isi |
|---|---|---|
| `email.send` | on-demand | kirim email, catat `EmailLog`, retry 3× backoff |
| `leave.rollover` | harian 00:30 | buat `LeaveBalance` periode baru |
| `reminder.certificate` | harian 07:00 | sertifikat kadaluarsa H-30 |
| `reminder.asset` | harian 07:00 | support/warranty berakhir H-30 |

Template email: `approval-requested`, `approval-progress`, `approval-final`, `reminder-expiry`. Semua berisi nomor dokumen, ringkasan, dan link ke halaman detail.

## 8. File Storage (`lib/storage/`)
Interface `put(bytes, ext) → key`, `get(key) → bytes`, `delete(key)`. Implementasi awal `LocalStorage` (`UPLOAD_DIR`), siap ditambah `S3Storage`. Key = `<uuid>.<pdf|jpg|png>` (format lain ditolak → aman dari path traversal). Upload lewat `saveUpload(file)`: validasi magic bytes + ukuran, lalu simpan.

Route `/api/files/[key]` (key, bukan id, karena file tersimpan sebagai `fileKey` di 4 tabel: `Document`, `Certificate`, `ReimbursementItem.receiptFileKey`, `HealthClaim.invoiceFileKey`). Pemilik dicari di keempat tabel itu. Izin: Admin (approver selalu Admin, §4.2), atau karyawan pemilik file. Belum login → 401, tidak berhak → 403, tidak ada → 404.

## 9. Keamanan
- Password hash argon2; minimal 8 karakter.
- Session JWT httpOnly; role & employeeId di token; user nonaktif ditolak saat login.
- Guard `requireUser()` / `requireAdmin()` di setiap Server Action & page.
- Rate limit sederhana pada login.
- Audit log: CREATE/UPDATE/DELETE, APPROVE, RESIGN, REHIRE, LOGIN.
- Backup: `pg_dump` harian (script disiapkan saat deployment).
