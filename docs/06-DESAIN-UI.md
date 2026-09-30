# DESAIN UI — Office Automation System

Referensi visual dari user (mockup, data di dalamnya hanya contoh):

| File | Halaman | Route |
|---|---|---|
| `design/01-dashboard-admin.webp` | Dashboard Admin + antrian approval | `/dashboard`, `/approval` |
| `design/02-karyawan.webp` | Direktori Karyawan & Dokumen | `/karyawan` |
| `design/03-reimburse-staf.webp` | Pusat Pengajuan & Benefit (sudut pandang Staf) | `/reimburse`, dashboard Staf |
| `design/04-project-inventory.png` | Monitoring Project & Unit Demo | `/inventory`, `/project` |

**Aturan utama:** desain adalah acuan *tampilan*. Fungsi & aturan bisnis tetap mengikuti
`01-URD.md` dan `02-TECH-SPEC.md`. Elemen desain yang tidak ada di spesifikasi
(lihat §5) **tidak dibuat** sebelum user memutuskan.

## 1. Gaya Visual

| Aspek | Acuan |
|---|---|
| Kesan | Bersih, terang, banyak ruang putih, kartu putih di atas latar abu-kebiruan sangat muda |
| Latar halaman | abu-biru sangat muda (≈ `#F6F8FB`); kartu `#FFFFFF`, border tipis/tanpa border, shadow halus |
| Warna utama (primary) | biru (≈ `#1D5FE0`) — tombol "Ajukan", link, progress bar, badge info |
| Aksen gelap | navy/hitam (≈ `#0F172A`) — item sidebar aktif, tombol aksi utama ("Setujui", "Tambah Karyawan") |
| Status | hijau = selesai/tetap/lengkap · biru = proses/dipinjam · merah = overdue/kurang/pending penting · abu = draft |
| Tipografi | sans-serif (Inter/Geist); judul halaman besar & tebal (~30px), label kolom UPPERCASE kecil dengan letter-spacing |
| Radius | kartu ~12–16px, badge/pill penuh (rounded-full) |
| Ikon | outline (lucide-react, sudah terpasang) |

Implementasi: tema diatur lewat CSS variables shadcn di `src/app/globals.css`
(`--primary`, `--background`, `--sidebar*`, `--radius`), bukan warna hard-code per komponen.

## 2. Shell Aplikasi (layout `(main)`)

**Sidebar kiri (putih, lebar ~260px, collapsible jadi drawer di HP):**
- Atas: logo + nama aplikasi.
- Grup menu dengan judul UPPERCASE kecil:
  - **UTAMA:** Dashboard, Profil Saya
  - **SUMBER DAYA MANUSIA:** Karyawan & Dokumen (sub-menu: Daftar Aktif, Arsip), Kandidat
  - **OPERASIONAL & ASET:** Inventory / Demo Unit, Project & Customer
  - **PENGAJUAN & KEUANGAN:** Reimburse, Cuti & Libur, Kesehatan & Plafon
  - **KONTROL & SISTEM:** Approval (badge jumlah pending milik user), Setting
- Item aktif: latar navy, teks putih, rounded.
- Menu disaring per role sesuai `04-MAPPING-MENU.md` (Staf tidak melihat grup SDM, Approval, Setting).
- "Laporan — Menyusul" boleh ditampilkan non-aktif (modul laporan di luar scope).

**Topbar:** kolom pencarian (lihat §5), tombol biru **+ Ajukan** (dropdown: Reimburse / Cuti /
Klaim Kesehatan), avatar + nama + role, tombol logout.

**Kepala halaman:** breadcrumb kecil → judul besar → deskripsi 1–2 baris abu → tombol aksi di kanan.

## 3. Komponen Reusable (dibuat di Tahap 3.5, dipakai semua modul)

| Komponen | Dilihat di | Catatan |
|---|---|---|
| `PageHeader` | semua | breadcrumb, judul, deskripsi, slot aksi |
| `StatCard` | baris 4 kartu di atas halaman | label UPPERCASE, angka besar, ikon di kotak berwarna kanan atas, keterangan/progress kecil di bawah |
| `DataTable` | semua tabel | header UPPERCASE abu-biru, baris lega, paginasi "Menampilkan x dari y" + nomor halaman |
| `PersonCell` | kolom pemohon/karyawan | avatar (foto atau inisial) + nama tebal + sub-teks (jabatan / NIK / email) |
| `StatusBadge` | status pengajuan, aset, kelengkapan | pill berwarna dengan titik; mapping warna tunggal dari enum status |
| `FilterPills` / `Tabs` | antrian approval, inventory | pill dengan jumlah, mis. "Semua (12)" |
| `FileChip` | kolom bukti/nota | ikon + nama file, membuka `/api/files/[key]` |
| `ApprovalStepper` | status reimburse | langkah "1. L1 ✓ → 2. L2 → Disetujui" sesuai step di `ApprovalRequestStep` |
| `ProgressBar` | saldo cuti, plafon | biru / hijau / merah sesuai persentase |
| `EmptyState` | tabel kosong | teks Bahasa Indonesia + aksi |

## 4. Pemetaan Desain → Halaman & Tahap

| Desain | Dipakai untuk | Tahap |
|---|---|---|
| Shell (sidebar + topbar) | layout `(main)` | 2.3 |
| Komponen §3 | semua modul | 3.5 |
| 02 — tabel karyawan, kolom kelengkapan berkas, tab Aktif / Arsip | `/karyawan`, `/karyawan/arsip` | 4.2, 4.3, 4.4 |
| 04 — tabel unit demo, status Tersedia / Dipinjam, tombol Pinjamkan / Kembalikan | `/inventory` | 9.1 |
| 04 — tab Biaya & Log Project | `/project/[id]` | 9.3 |
| 01 — tabel antrian approval + tombol Setujui | `/approval`, dashboard Admin | 5.5, 10.2 |
| 03 — kartu saldo cuti / plafon, tabel riwayat reimburse dengan stepper | `/reimburse`, dashboard Staf | 6.3, 10.2 |
| 01 — kartu kalender libur & cuti pekan ini | dashboard, `/cuti/kalender` | 7.1, 10.2 |

## 5. Elemen Desain di Luar Spesifikasi — PERLU KEPUTUSAN USER

Jangan dibuat sampai ada jawaban. Setelah diputuskan, perbarui tabel ini (dan URD bila menambah fitur).

| No | Elemen di desain | Kondisi di spesifikasi | Default sementara |
|---|---|---|---|
| D-01 | Nama "WorkFlow OA" | Spec: "Office Automation" | Pakai "Office Automation" |
| D-02 | Switch "Mode: Admin" di sidebar | Tidak ada; role tetap per akun | Tidak dibuat (tampilkan role sebagai label saja) |
| D-03 | Tombol **Tolak** di antrian approval | OI-05: reject ditunda, belum ada UI | Hanya tombol Setujui |
| D-04 | Status kontrak (Tetap PKWTT / Kontrak PKWT / Probation) | Tidak ada field di `Employee` | Kolom diganti Status (Aktif) + masa kerja |
| D-05 | Verifikasi dokumen oleh HR ("Dokumen Terverifikasi", antrian Verifikasi) | Tidak ada alur verifikasi | Hanya indikator kelengkapan (DOC-03) |
| D-06 | Tahap Finance / Transfer / "Cair", cut-off payroll tgl 20 | Approval hanya L1 → L2 final | Stepper sampai "Disetujui" |
| D-07 | Tenggat kembali, "Overdue", check-in unit demo, tujuan/klien peminjaman | `AssetAssignment` hanya tanggal serah & kembali + catatan | Status Tersedia / Dipinjam saja |
| D-08 | Statistik anggaran, budget per kategori, "Insight AI Finansial" | Tidak ada anggaran; laporan di luar scope | Tidak dibuat |
| D-09 | Unduh Ringkasan, Export CSV | Modul laporan di luar scope | Tidak dibuat |
| D-10 | Form "Fast Track" dengan auto-extract nominal dari foto nota (OCR) | Tidak ada | Form reimburse multi-baris biasa (RMB-02/03) |
| D-11 | Pencarian global di topbar & lonceng notifikasi | Tidak ada (notifikasi via email) | Search & lonceng tidak dibuat |
| D-12 | Filter periode "Bulan Ini" di dashboard | Tidak ada | Tidak dibuat |
| D-13 | Distribusi divisi custom (Engineering & IT Ops, dll.) | Divisi: SALES / ENGINEER / UMUM / DIRECTOR | Pakai 4 divisi tersebut |
| D-14 | Batas upload "max 8MB" | Spec: 5 MB | 5 MB |
