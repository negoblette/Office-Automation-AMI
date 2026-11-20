# MAPPING MENU — Office Automation System

Role: **Admin** (Ko Yosep, Ko Rudy, Ko Darwin, Ko Leonard, Ci Ika) dan **Staf**
(Sales, Engineer, Umum). Aksi approval hanya muncul jika Admin terdaftar di
approval flow pengajuan tersebut.

| Menu / Sub-menu | Route | Admin | Staf |
|---|---|---|---|
| Dashboard | `/dashboard` | Ringkasan semua data + antrian approval sendiri | Status pengajuan, saldo cuti, sisa plafon, reminder |
| Absensi (clock in / out, riwayat) | `/absensi` | ✔ + tab Rekap Karyawan | ✔ milik sendiri |
| └ Detail & koreksi per karyawan | `/absensi/[employeeId]` | ✔ | — |
| Profil Saya | `/profil` | ✔ | ✔ |
| └ Dokumen & Keluarga | `/profil/dokumen` | ✔ | ✔ |
| └ Sertifikat & Ijazah | `/profil/sertifikat` | ✔ | ✔ |
| └ Inventory Saya | `/profil/inventory` | ✔ | Lihat |
| **Karyawan** | `/karyawan` | ✔ | — |
| └ Daftar Aktif / Tambah / Edit | `/karyawan`, `/karyawan/baru`, `/karyawan/[id]` | ✔ | — |
| └ Tombol Resign & Rehire | di `/karyawan/[id]` | ✔ | — |
| └ Arsip (Resign) | `/karyawan/arsip` | ✔ | — |
| **Kandidat** | `/kandidat` | ✔ | — |
| **Inventaris / Unit Demo** *(aktif lagi 2026-11-17)* | `/inventory` | ✔ Kelola (daftar unit, rak & posisi) | Divisi **Engineer & Sales**: lihat stok & lokasi. User yang ditunjuk **Operational** (Setting, role apa pun): lihat + kelola |
| └ Daftar Unit & detail unit (peminjaman, Riwayat Unit, tombol Ubah Unit; Tambah Unit = milik AMI saja) | `/inventory`, `/inventory/[id]` | ✔ | Sama dengan di atas (Ubah Unit: Admin & Operational) |
| └ Penerimaan Barang (barang principal / distributor masuk → HAF; daftar, detail, Terima Barang, Cetak HAF asli + COPY) | `/inventory/penerimaan`, `/inventory/penerimaan/baru`, `/inventory/penerimaan/[id]`, `/cetak/penerimaan/[id]` | Lihat (Terima Barang hanya bila ditunjuk Operational) | Semua user Inventaris melihat; **Terima Barang hanya Operational** |
| └ Peminjaman (daftar, detail) | `/inventory/peminjaman`, `/inventory/peminjaman/[id]` | ✔ Lihat semua + ajukan (langkah Operational hanya bila Admin itu ditunjuk Operational) | Engineer & Sales: lihat semua + ajukan. Approver di Approval Flow "Peminjaman Unit" (Ko Yosep): Setujui / Tolak di Approval Center atau di detail. **Hanya Operational** (Setting → Inventaris & Rak, 2026-11-19): siapkan (Item Sender), Sudah Diantar, Jadwalkan / Ubah / Batalkan Pengambilan |
| └ Ajukan / Ubah / Revisi peminjaman (PIC = Engineer / Sales; kontak peminjam "up:"; satu form satu pemilik unit) | `/inventory/peminjaman/baru`, `/inventory/peminjaman/[id]/ubah` | ✔ | Pemohon (selama belum disetujui) |
| └ Cetak Product Trial Form (2 lembar: asli + COPY) | `/cetak/peminjaman/[id]` | ✔ (sejak disetujui) | Semua user Inventaris |
| └ Ajukan / batalkan Perpanjangan jatuh tempo (dialog & kartu Perpanjangan di detail) | `/inventory/peminjaman/[id]` (link email: `/inventory/peminjaman/perpanjangan/[id]`) | Pemohon saja (bukan atas nama orang lain) | Pemohon & Operational mengajukan (status Dipinjam); approver Approval Flow "Peminjaman Unit" (Ko Yosep) Setujui / Tolak di detail atau Approval Center |
| └ Pengecekan Unit (cek unit & taruh di rak, setelah barang tiba di AMI) | `/inventory/peminjaman/[id]/kembali` | — (kecuali ditunjuk Operational) | Operational (status Pengambilan) → **Menunggu verifikasi** |
| └ Verifikasi Pengecekan Unit (Setujui / Tolak) | Approval Center & detail peminjaman | Approver di Approval Flow "Verifikasi Pengembalian Unit" (Ko Yosep) | Disetujui → Selesai / **Tindak lanjut**; ditolak → Operational cek ulang |
| └ Selesaikan Tindak Lanjut (dialog di detail: hasil tiap unit bermasalah + catatan) | `/inventory/peminjaman/[id]` | Lihat saja (kecuali ditunjuk Operational) | Operational menutup; PIC & Operational menerima email & lonceng tiap 7 hari sampai selesai |
| └ Cetak Hardware Admission Form (2 lembar: asli + COPY, dibawa kurir) | `/cetak/peminjaman/[id]/haf` | ✔ (sejak pengambilan dijadwalkan) | Semua user Inventaris |
| **Reimburse** | `/reimburse` | Ajukan + lihat semua | Ajukan + milik sendiri |
| └ Pengajuan Baru | `/reimburse/baru` | ✔ | ✔ |
| └ Detail | `/reimburse/[id]` | ✔ | Milik sendiri |
| **Cuti** | `/cuti` | Ajukan + lihat semua | Ajukan + milik sendiri |
| └ Saldo | `/cuti/saldo` | Semua karyawan | Milik sendiri |
| └ Kalender Libur (libur nasional otomatis dari kalender Google tiap hari + tombol Sinkronkan sekarang & riwayat perubahan, Admin) | `/cuti/kalender` | Kelola | Lihat |
| **Kesehatan** | `/kesehatan` | Ajukan + lihat semua | Ajukan + milik sendiri |
| └ Rekap bulanan (PDF) per karyawan / semua karyawan | `/cetak/kesehatan?bulan=YYYY-MM&karyawan=<id>` | ✔ satu / semua karyawan | Milik sendiri |
| └ Jadwal Pembayaran | `/kesehatan/pembayaran` | ✔ | — |
| **Project** | `/project` | ✔ | Lihat |
| └ Customer & Project | `/project/customer` | Kelola | — |
| └ Expense / Revenue | `/project/[id]` | Input + lihat | Lihat project terkait |
| **Approval** | `/approval` | Antrian sendiri + monitor semua | — (role **Approver**: antrian sendiri + riwayat pengajuan yang melibatkannya) |
| **Setting** | `/setting` | ✔ | — |
| └ User & Role | `/setting/user` | ✔ | — |
| └ Approval Flow | `/setting/approval` | ✔ | — |
| └ Jatah Cuti & Carry Over (+ penerima notifikasi perubahan libur) | `/setting/cuti` | ✔ | — |
| └ Plafon Kesehatan | `/setting/kesehatan` | ✔ | — |
| └ Jam Kerja & Absensi | `/setting/absensi` | ✔ | — |
| └ Master Data (tipe reimburse, kategori klaim) | `/setting/master` | ✔ | — |
| └ Inventaris & Rak (Operational, nomor Product Trial Form & Hardware Admission Form `NNN/AMI-PTF\|HAF/<pemilik unit>/<tahun>`, daftar rak) | `/setting/inventaris` | ✔ | — |
| └ Kunci Pemulihan (kartu di halaman Setting) | `/setting/kunci-pemulihan` | Hanya pemegang kunci (`RECOVERY_KEY_HOLDERS`: Pak Rudy & Pak Leonard) | — |
| Laporan | — | *(menyusul)* | — |
