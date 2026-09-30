# PLAN — Urutan Pengerjaan dengan Claude Code

## Cara Pakai

1. Buat repository kosong, salin seluruh isi paket ini ke root-nya
   (`CLAUDE.md`, `docs/`, `prisma/`, `prisma.config.ts`, `docker-compose.yml`, `.env.example`).
2. Jalankan `claude` di folder tersebut.
3. Kerjakan **satu fase per sesi**. Mulai setiap fase dengan prompt contoh di bawah.
   Minta Claude Code membuat rencana dulu (Plan Mode, `Shift+Tab`), review, baru eksekusi.
4. Setelah fase selesai dan kriteria terpenuhi: review diff, `git commit`, lalu `/clear`
   sebelum fase berikutnya supaya konteks bersih.

---

## Fase 0 — Setup Project

**Prompt:**
> Baca CLAUDE.md dan docs/02-TECH-SPEC.md. Setup project Next.js (App Router, TypeScript
> strict, Tailwind, ESLint) di folder ini tanpa menghapus file yang sudah ada. Install
> Prisma 7 + @prisma/adapter-pg, Zod, React Hook Form, shadcn/ui, Vitest, date-fns-tz.
> Buat src/lib/db.ts, script npm (dev, worker, lint, typecheck, test), dan jalankan
> migrasi awal dari prisma/schema.prisma. Buat rencana dulu sebelum mengeksekusi.

**Kriteria selesai:**
- [ ] `docker compose up -d` dan `npm run dev` berjalan
- [ ] Migrasi awal sukses, semua tabel ada (cek dengan `npx prisma studio`)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` lulus

## Fase 1 — Seed Data

**Prompt:**
> Buat prisma/seed.ts sesuai docs/02-TECH-SPEC.md §4.4: user Admin (Yosep, Rudy,
> Darwin, Leonard, Ika) dan satu staf contoh per divisi termasuk Bu Devi (UMUM),
> LeavePolicy (0/12/15/18), AppSetting leave.maxCarryOver = 3, ReimburseType per divisi,
> HealthCategory, dan seluruh ApprovalFlow termasuk FALLBACK. skipApproval untuk Rudy
> dan Leonard. Password default dari env SEED_PASSWORD.

**Kriteria selesai:**
- [ ] `npx prisma db seed` bisa dijalankan berulang tanpa duplikat (pakai upsert)
- [ ] Data flow approval sesuai tabel §4.4

## Fase 2 — Auth, Guard & Layout

**Prompt:**
> Implementasikan login dengan Auth.js v5 Credentials (argon2), session JWT berisi
> userId, role, employeeId. Buat guard requireUser/requireAdmin, middleware proteksi
> route (main), dan layout sidebar sesuai docs/04-MAPPING-MENU.md (menu Admin vs Staf).

**Kriteria selesai:**
- [ ] Login/logout jalan; user nonaktif ditolak
- [ ] Staf membuka `/karyawan` atau `/setting` → ditolak (dicek di server)
- [ ] Menu sidebar sesuai role

## Fase 3 — Fondasi Bersama

**Prompt:**
> Buat src/lib/validators/common.ts (docs/02-TECH-SPEC.md §5) beserta unit test,
> src/lib/format.ts (Rupiah, tanggal Indonesia, NPWP, telepon), helper serializeMoney,
> service audit log, dan storage adapter lokal + route /api/files/[id] dengan cek akses.
> Buat juga komponen form & tabel dasar yang dipakai ulang.

**Kriteria selesai:**
- [ ] Test validator mencakup kasus valid & invalid tiap field
- [ ] Upload file > 5 MB atau bukan pdf/jpg/png ditolak
- [ ] File tidak bisa diunduh oleh user yang tidak berhak

## Fase 4 — Master Karyawan (EMP, DOC, CERT)

**Prompt:**
> Implementasikan modul Karyawan sesuai URD §3.1–3.3: daftar aktif, tambah/edit dengan
> validasi, detail dengan tab Data Diri / Keluarga / Dokumen / Sertifikat / Inventory /
> Riwayat Kerja, tombol Resign, halaman Arsip, dan alur Rehire berdasarkan NIK
> (docs/02-TECH-SPEC.md §6.1). Buat juga halaman Profil Saya untuk Staf.

**Kriteria selesai:**
- [ ] Resign memindahkan ke Arsip, menonaktifkan akun, data tetap ada
- [ ] Rehire NIK lama menambah EmploymentPeriod baru
- [ ] Dokumen keluarga hanya muncul jika status menikah
- [ ] Indikator kelengkapan dokumen tampil

## Fase 5 — Approval Engine, Penomoran & Email

**Prompt:**
> Implementasikan services/numbering.ts dan services/approval.ts sesuai
> docs/02-TECH-SPEC.md §3 dan §4, termasuk seluruh skenario uji di §4.5 sebagai unit
> test. Setup pg-boss worker dengan job email.send (Nodemailer + React Email, template
> approval-requested/progress/final) dan EmailLog. Buat halaman /approval (antrian
> milik Admin yang login + monitor semua).

**Kriteria selesai:**
- [ ] Semua skenario §4.5 lulus test
- [ ] Nomor tidak pernah ganda (test paralel)
- [ ] Email terlihat di Mailpit (http://localhost:8025)

## Fase 6 — Reimburse (RMB)

**Prompt:**
> Implementasikan modul Reimburse sesuai URD §3.5 dan Tech Spec §6.4: form multi-baris
> seperti tabel contoh (Date, Company, Names–Position, Activities, Location, Type,
> Receipt, Payment By, Total), upload kwitansi per baris, subtotal Cash/CC/Total,
> simpan draft, submit ke approval engine, dan halaman detail dengan riwayat approval.

**Kriteria selesai:**
- [ ] Dropdown tipe sesuai divisi pemohon
- [ ] Total dihitung ulang di server
- [ ] Alur Engineer → Yosep → Rudy dan Sales → Darwin → Leonard berjalan end-to-end

## Fase 7 — Cuti (LV)

**Prompt:**
> Implementasikan modul Cuti sesuai URD §3.6 dan Tech Spec §6.2: Setting LeavePolicy &
> carry over, kalender libur (nasional + manual), perhitungan hari kerja, saldo cuti,
> pengajuan via approval engine, dan job leave.rollover. Tandai asumsi dengan
> TODO(OI-02) dan TODO(OI-03).

**Kriteria selesai:**
- [ ] Unit test masa kerja batas 0, 1, 5, 6, 15, 16 tahun
- [ ] Hari libur & akhir pekan tidak terhitung
- [ ] Pengajuan melebihi saldo ditolak; saldo terpotong setelah APPROVED final

## Fase 8 — Kesehatan (HC)

**Prompt:**
> Implementasikan modul Kesehatan sesuai URD §3.7 dan Tech Spec §6.3: Setting plafon
> per karyawan per tahun, klaim dengan invoice, approval (Ika; klaim Ika ke FALLBACK),
> jadwal HealthPayout dengan limpahan ke bulan berikutnya, dan halaman Jadwal Pembayaran
> untuk Finance. Tandai asumsi TODO(OI-01), TODO(OI-04), TODO(OI-10).

**Kriteria selesai:**
- [ ] Test: klaim > plafon bulanan terbagi ke beberapa bulan
- [ ] Klaim > sisa plafon tahunan ditolak

## Fase 9 — Inventory, Project, Kandidat

**Prompt:**
> Implementasikan Inventory/Demo Unit (URD §3.4) dengan assign & riwayat, modul Project
> (Customer, Project, Expense, Revenue via approval engine, total expense termasuk baris
> reimburse — Tech Spec §6.5), dan modul Kandidat (URD §3.8) dengan konversi ke karyawan.

**Kriteria selesai:**
- [ ] Serial number unik & uppercase
- [ ] Total expense project mencakup reimburse yang APPROVED
- [ ] Konversi kandidat memindahkan data & dokumen

## Fase 10 — Reminder, Dashboard & Hardening

**Prompt:**
> Tambahkan job reminder.certificate dan reminder.asset (H-30), dashboard Admin & Staf
> sesuai docs/04-MAPPING-MENU.md, audit log di semua action, rate limit login, dan
> Dockerfile produksi (app + worker, output standalone). Review seluruh Server Action
> untuk memastikan otorisasi dicek di server.

**Kriteria selesai:**
- [x] Email reminder muncul di Mailpit
- [x] Checklist keamanan Tech Spec §9 terpenuhi
- [x] `docker compose` produksi bisa dijalankan

---

## Tips Bekerja dengan Claude Code
- Jika hasil menyimpang dari docs, minta Claude Code membaca ulang bagian docs yang relevan.
- Jika user memberi jawaban baru untuk Open Issue, **update `docs/01-URD.md` dulu**, lalu
  minta Claude Code mencari `TODO(OI-xx)` terkait dan menyesuaikan kode.
- Simpan keputusan penting baru ke `CLAUDE.md` supaya diingat di sesi berikutnya.
