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
| └ Daftar Unit & detail unit (peminjaman, Riwayat Unit, tombol Ubah Unit) | `/inventory`, `/inventory/[id]` | ✔ | Sama dengan di atas (Ubah Unit: Admin & Operational) |
| └ Peminjaman (daftar, detail) | `/inventory/peminjaman`, `/inventory/peminjaman/[id]` | ✔ Lihat semua + ajukan + siapkan (Item Sender) | Engineer & Sales: lihat semua + ajukan. Approver di Approval Flow "Peminjaman Unit" (Ko Yosep): Setujui / Tolak di Approval Center atau di detail. Operational: siapkan yang sudah disetujui (Item Sender) |
| └ Ajukan / Ubah / Revisi peminjaman | `/inventory/peminjaman/baru`, `/inventory/peminjaman/[id]/ubah` | ✔ | Pemohon (selama belum disetujui) |
| └ Cetak Product Trial Form | `/cetak/peminjaman/[id]` | ✔ (sejak disetujui) | Semua user Inventaris; tombol Sudah Diantar hanya Operational |
| **Reimburse** | `/reimburse` | Ajukan + lihat semua | Ajukan + milik sendiri |
| └ Pengajuan Baru | `/reimburse/baru` | ✔ | ✔ |
| └ Detail | `/reimburse/[id]` | ✔ | Milik sendiri |
| **Cuti** | `/cuti` | Ajukan + lihat semua | Ajukan + milik sendiri |
| └ Saldo | `/cuti/saldo` | Semua karyawan | Milik sendiri |
| └ Kalender Libur | `/cuti/kalender` | Kelola | Lihat |
| **Kesehatan** | `/kesehatan` | Ajukan + lihat semua | Ajukan + milik sendiri |
| └ Jadwal Pembayaran | `/kesehatan/pembayaran` | ✔ | — |
| **Project** | `/project` | ✔ | Lihat |
| └ Customer & Project | `/project/customer` | Kelola | — |
| └ Expense / Revenue | `/project/[id]` | Input + lihat | Lihat project terkait |
| **Approval** | `/approval` | Antrian sendiri + monitor semua | — (role **Approver**: antrian sendiri + riwayat pengajuan yang melibatkannya) |
| **Setting** | `/setting` | ✔ | — |
| └ User & Role | `/setting/user` | ✔ | — |
| └ Approval Flow | `/setting/approval` | ✔ | — |
| └ Jatah Cuti & Carry Over | `/setting/cuti` | ✔ | — |
| └ Plafon Kesehatan | `/setting/kesehatan` | ✔ | — |
| └ Jam Kerja & Absensi | `/setting/absensi` | ✔ | — |
| └ Master Data (tipe reimburse, kategori klaim) | `/setting/master` | ✔ | — |
| └ Inventaris & Rak (Operational, nomor Product Trial Form, daftar rak) | `/setting/inventaris` | ✔ | — |
| └ Kunci Pemulihan (kartu di halaman Setting) | `/setting/kunci-pemulihan` | Hanya pemegang kunci (`RECOVERY_KEY_HOLDERS`: Pak Rudy & Pak Leonard) | — |
| Laporan | — | *(menyusul)* | — |
