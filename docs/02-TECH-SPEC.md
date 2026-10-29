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
| Project | `Customer`, `Project`, `ProjectExpense` |
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
| EXPENSE | set status APPROVED |

### 4.4 Seed flow awal
| Scope | Module | Divisi | Level 1 | Level 2 |
|---|---|---|---|---|
| REGULAR | REIMBURSE, LEAVE, EXPENSE | ENGINEER | Yosep | Rudy |
| REGULAR | REIMBURSE, LEAVE, EXPENSE | SALES | Darwin | Leonard |
| REGULAR | REIMBURSE, LEAVE, EXPENSE | UMUM | Rudy / Leonard | — |
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
| Password | 15–128 karakter (lihat §9) | — |
| Nominal | integer > 0 | terima input "1.250.000" → 1250000 |
| Tanggal | ISO date | end ≥ start |
| File | pdf/jpg/png, ≤5 MB | cek magic bytes, bukan hanya ekstensi |

## 6. Logika Bisnis

### 6.1 Karyawan
- **Resign** (`services/employee.ts#resign`): isi `endDate` periode aktif, `endReason = "RESIGN"`, `Employee.status = RESIGNED`, `User.isActive = false`, audit log.
- **Buat akun** (`services/employee.ts#createEmployee`, Admin): field wajib hanya nama, email, divisi, jabatan, tanggal masuk, role, dan **password awal yang diketik Admin** (diberikan ke staf; keputusan user 2026-09-24) → buat `Employee` + `EmploymentPeriod` + `User`. `nik` & `employeeNo` boleh kosong (diisi belakangan).
- **Isi data mandiri** (EMP-06): staf mengubah data dirinya sendiri lewat `/profil`. Field yang **hanya Admin** boleh ubah: `division`, `User.role`, `email`, `EmploymentPeriod.startDate/endDate` (menentukan jatah cuti), plus field sistem (`status`, `skipApproval`). Dicek di server (schema Zod terpisah untuk staf vs Admin), bukan hanya disembunyikan di form.
- **NIK unik**: bila NIK yang diisi sudah dipakai karyawan lain → tolak dengan pesan "NIK sudah terdaftar, hubungi Admin". Email & nomor karyawan juga unik. NIK tersimpan terenkripsi, jadi keunikannya dicek lewat sidik jari `Employee.nikHash` (HMAC-SHA256, unik) — hardening Tahap 4, §9.
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
Interface `put(bytes, ext) → key`, `get(key) → bytes`, `delete(key)`. Implementasi awal `LocalStorage` (`UPLOAD_DIR`), siap ditambah `S3Storage`. Key = `<uuid>.<pdf|jpg|png>` (format lain ditolak → aman dari path traversal). Upload lewat `saveUpload(file)`: validasi magic bytes + ukuran, lalu simpan. Isi file disimpan terenkripsi AES-256-GCM (header `OAE1`, key file sebagai AAD) dan dibuka di dalam `get()`, jadi ukuran, unduhan, dan hak akses tidak berubah; file lama tanpa header tetap terbaca (hardening Tahap 4).

Route `/api/files/[key]` (key, bukan id, karena file tersimpan sebagai `fileKey` di `Document` (termasuk dokumen kandidat), `Certificate`, dan `AttendanceAppeal`). Pemilik dicari di tabel-tabel itu. Izin: Admin (approver selalu Admin, §4.2), atau karyawan pemilik file. Belum login → 401, tidak berhak → 403, tidak ada → 404.

## 9. Keamanan
- Password hash argon2. Password baru 15–128 karakter tanpa aturan komposisi; ditolak bila berupa
  karakter berulang, deret (123…/qwerty…), kata umum + angka/simbol, atau memuat nama/email pemilik
  (`lib/password-policy.ts`, NIST SP 800-63B-4) — hardening 2026-10.
- Akun baru, hasil konversi kandidat, dan hasil reset Admin wajib ganti password saat login berikutnya
  (`User.mustChangePassword` → `/ganti-password`). Karyawan bisa ganti password sendiri (password lama wajib benar).
- Session JWT httpOnly; role, employeeId & `sessionVersion` di token. Sesi berakhir setelah 1 jam tidak aktif
  atau 12 jam sejak login. Ganti/reset password menaikkan `User.sessionVersion` → semua sesi lama dicabut.
  User nonaktif ditolak saat login dan di setiap request.
- Guard `requireUser()` / `requireAdmin()` di setiap Server Action & page.
- Rate limit login (`LOGIN_FAILED` di AuditLog, dengan IP): ditahan 15 menit bila 5 gagal dari email+IP yang sama,
  20 gagal ke satu email, atau 20 gagal dari satu IP. Email tak terdaftar tetap menjalankan argon2 (anti enumerasi akun).
- **MFA (hardening Tahap 5, 2026-10-20):** Admin & Approver wajib kode 6 digit TOTP (Google/Microsoft Authenticator;
  RFC 6238, SHA-1, 30 detik, toleransi ±1 langkah) — `services/mfa.ts`, library `otpauth` + `qrcode`. Belum terdaftar →
  setelah login (dan setelah ganti password awal) diarahkan ke `/mfa` sebelum bisa memakai aplikasi; route API memakai
  `getReadyUser()`. Login dua langkah: password benar → form meminta kode (`mfa_required`); kode salah dihitung
  `LOGIN_FAILED`. Kode yang sama tidak bisa dipakai dua kali (`User.mfaLastStep`). Rahasia disimpan terenkripsi
  (`User.mfaSecret`, `encryptText`). 10 kode cadangan sekali pakai (`MfaBackupCode`, hanya hash SHA-256), ditampilkan
  sekali, bisa dibuat ulang di `/mfa` dengan kode authenticator. Admin me-reset MFA user lain (Setting → User, bukan
  akun sendiri) → data MFA dihapus, sesi dicabut, tercatat di audit (`after.mfaReset`). Email `security-notice` ke
  pemilik akun setiap password diganti/di-reset, MFA diaktifkan/di-reset, kode cadangan dibuat ulang atau dipakai.
- Audit log: CREATE/UPDATE/DELETE, APPROVE, RESIGN, REHIRE, LOGIN — dengan IP & user agent bila berasal dari request.
- **Audit, monitoring & alarm (hardening Tahap 6, 2026-10-21):**
  - IP & perangkat juga dicatat di ubah role / aktif-nonaktif / reset password / reset MFA, approve / tolak / batalkan /
    koreksi approval. Unduhan file (`/api/files`, `DOWNLOAD`) dan export Excel (`EXPORT`) ikut tercatat.
  - **Audit log permanen:** trigger `AuditLog_immutable` menolak UPDATE/DELETE (migrasi `audit_log_immutable`), plus
    `oa_app` tidak punya hak UPDATE/DELETE/TRUNCATE di tabel itu. Akibatnya User dengan riwayat audit tidak bisa dihapus
    permanen (memang dinonaktifkan). Pengganti hapus catatan gagal: Admin **buka blokir login** di Setting → User
    (`LOGIN_UNLOCK`; gagal sebelum unlock tidak dihitung lagi untuk email itu, batas per IP tetap).
  - **Alarm email ke semua Admin aktif** (`services/security-monitor.ts`, template `security-alert`, dicatat
    `SECURITY_ALERT` sekaligus anti-email ganda): ≥ 5 login gagal ke akun Admin/Approver dalam 15 menit (sekali per
    jendela); setiap perubahan role; ≥ 50 unduhan/export/buka data pribadi oleh satu user dalam 1 jam (sekali per jam).
  - **SMTP wajib TLS di produksi** (`smtpTransportOptions`): 465 TLS langsung, port lain wajib STARTTLS, minimal TLS 1.2,
    sertifikat valid. Dev Mailpit tanpa TLS (`SMTP_REQUIRE_TLS=true` untuk memaksa).
  - **`GET /api/health`** (tanpa login): `{status, database}` 200 / 503, tanpa detail; dipakai healthcheck Docker app.
  - Salinan backup ke luar server: `scripts/backup-offsite.sh` (cron di host, rsync ke NAS ber-penanda `.oa-offsite` dan/atau
    `rclone` ke cloud; cek backup terbaru lengkap & < 26 jam, cek salinan, retensi `OFFSITE_KEEP_DAYS`, ping monitor
    opsional) — panduan `docs/07-DEPLOYMENT.md` §7. Tujuan (NAS / cloud) menunggu keputusan manajemen.
- **Upload & file (hardening Tahap 7, 2026-10-21):**
  - Setiap upload dicatat di `UploadedFile` (pengunggah, ukuran). File **hanya bisa ditautkan ke data oleh pengunggahnya**
    (`assertFileKeyAvailable(tx, key, actorId)` → `assertUploadedBy`); key tanpa catatan upload ditolak.
  - Kuota per orang: 30 file / jam, 200 MB / 24 jam (`UPLOAD_QUOTA`).
  - PDF berisi JavaScript, Launch, SubmitForm/ImportData, file tersemat, RichMedia, atau XFA ditolak saat upload
    (`pdfActiveContent`, juga memeriksa nama ber-escape `#xx` dan stream FlateDecode / object stream). Link & /OpenAction
    untuk zoom tetap boleh.
  - `/api/files`: CSP ketat (`default-src 'none'`, tanpa skrip/form/frame), `sandbox` untuk gambar lama; PDF tanpa
    `sandbox` supaya penampil PDF Chrome/Edge tetap jalan. Plus `X-Download-Options: noopen`.
  - Job `storage.orphan-purge` (harian 03:00 WIB): file di storage berumur ≥ 24 jam yang tidak dipakai data apa pun
    (termasuk data yang di-soft-delete — file-nya tetap disimpan) dihapus & dicatat audit (`DELETE` entity `File`).
  - ClamAV belum dipasang (opsional, bisa ditambah nanti).
- Content Security Policy bernonce per request (`src/proxy.ts`, `lib/security/csp.ts`); semua halaman dirender
  dinamis (`connection()` di root layout). Mode lewat `CSP_MODE` (produksi: enforce; dev: report-only). Script, font,
  gambar, atau koneksi ke domain luar harus ditambahkan ke CSP lebih dulu. Header tambahan: COOP & CORP same-origin.
- Produksi hanya lewat reverse proxy nginx (`deploy/nginx/`): HTTPS TLS 1.2/1.3, HSTS 1 tahun, header IP ditimpa
  (X-Real-IP), hanya jaringan di `ALLOWED_SUBNETS`, port diikat ke `BIND_IP`, rate limit per IP (umum 10/dtk,
  POST 2/dtk, login 10/mnt, export 6/mnt), upload maks 6 MB. Port aplikasi tidak dibuka ke host. Sertifikat di
  `deploy/certs/` (atau Let's Encrypt lewat `TLS_CERT_PATH`/`TLS_KEY_PATH`), di-reload otomatis tiap 6 jam.
- Data pribadi terenkripsi AES-256-GCM per kolom (hardening Tahap 4, `docs/08-INVENTARIS-DATA.md`): NIK, No KK, NPWP,
  BPJS TK/Kesehatan, No HP, tanggal lahir (disimpan `YYYY-MM-DD`), kontak darurat (Employee); NIK & tanggal lahir
  keluarga; NIK & HP kandidat. Dikunci/dibuka di lapisan service/query
  (`services/personal-data.ts`), jadi logika & tampilan memakai nilai terbuka seperti biasa. Urutan anggota keluarga
  dihitung di aplikasi (`compareFamilyMembers`, sama dengan ORDER BY sebelumnya). Kunci di env:
  `DATA_ENCRYPTION_KEYS` (ring `v1:…`, entri pertama aktif → rotasi tanpa kehilangan data lama) & `DATA_INDEX_KEY`.
  Data lama / rotasi: `npm run data:encrypt` (produksi: otomatis setelah migrasi). Data asli hanya dibuka lewat aplikasi
  atau `data:lihat` / `data:cari-nik` di server (wajib alasan, tercatat `VIEW_PERSONAL_DATA`). Audit log tidak memuat
  data pribadi terbuka.
- Role database minimum: `oa` pemilik (migrasi/seed/Studio, `MIGRATE_DATABASE_URL`), `oa_app` aplikasi & worker (hanya
  SELECT/INSERT/UPDATE/DELETE + pemilik skema `pgboss`, tanpa hak CREATE di database), `oa_backup` hanya baca
  (`deploy/postgres/init-roles.sh`, dev: `npm run db:roles`).
- Produksi (`docker-compose.prod.yml`): database hanya di jaringan internal `db_net` (tanpa internet; proxy tidak
  tersambung), `pg_hba.conf` hanya `samenet` + scram-sha-256, log login/logout & DDL. Tiap service hanya menerima env
  miliknya (worker tanpa `AUTH_SECRET` & kunci data). Container: no-new-privileges, cap_drop ALL, read-only + tmpfs,
  batas memori/CPU/proses, rotasi log, versi image dikunci.
- Backup harian terenkripsi `age` (`scripts/backup.sh`, role `oa_backup`) untuk minimal 2 pemegang kunci (Pak Rudy &
  Pak Leonard, env `RECOVERY_KEY_HOLDERS`); pulihkan dengan `scripts/restore.sh`. Folder `backups/` wajib disalin ke
  luar server (`docs/07-DEPLOYMENT.md`).
- Kunci pemulihan (2026-10-21, `services/recovery-key.ts`, tabel `RecoveryKey`): pemegang kunci membuat **kata sandi
  pemulihan** di Setting → Kunci Pemulihan (hanya untuk mereka; konfirmasi password login; min. 15 karakter, beda dari
  password login) — tanpa perintah teknis. Aplikasi membuat kunci `age` X25519 per pemegang, menguncinya dengan kata
  sandi itu (scrypt), dan menyimpannya sebagai file di `RECOVERY_DIR` (volume `recovery`, bukan database), lalu menulis
  `penerima.txt` (gembok backup) & `kunci-data.age` (titipan `DATA_ENCRYPTION_KEYS`/`DATA_INDEX_KEY`). Service `migrate`
  memperbarui titipan di setiap deploy (`recovery:refresh`). Setiap backup ikut menyalin folder itu (`kunci_*.tar`);
  `restore.sh` meminta pemegang kunci yang hadir mengetik kata sandinya. Buat/ganti kunci → audit + alarm email ke semua
  Admin; uji kata sandi (5 salah / 15 menit → ditahan) dan pengingat dashboard bila belum dibuat / > 90 hari belum diuji.
- Dev: data karyawan asli dilarang; data contoh `npm run dev:data-palsu`; `npm run lint` menolak `$queryRawUnsafe` /
  `$executeRawUnsafe`; terminal dev tidak mencetak argumen Server Action (`logging.serverFunctions: false`).
