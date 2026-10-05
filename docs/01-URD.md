# USER REQUIREMENT DOCUMENT — Office Automation System

| | |
|---|---|
| Versi | 0.2 (Draft — siap development) |
| Klien | Internal PT Artha Mitra Interdata |
| Status | Disetujui untuk development, dengan Open Issue di §6 |

## 1. Pendahuluan

### 1.1 Tujuan
Menyediakan aplikasi web internal untuk mengelola data karyawan dan proses
administrasi kantor (finansial maupun teknis) dalam satu sistem terpusat, dengan
alur approval berjenjang dan notifikasi email.

### 1.2 Ruang Lingkup (In Scope)
1. Master Data Karyawan (historis + arsip resign)
2. Dokumen Karyawan & Keluarga
3. Sertifikat Profesional & Ijazah
4. Inventory / Demo Unit
5. Reimbursement
6. Cuti
7. Klaim Kesehatan
8. Kandidat Karyawan
9. Expense & Revenue Project
10. Role User, Mapping Approval, Setting
11. Notifikasi Email

### 1.3 Di Luar Ruang Lingkup (fase ini)
- Tools testing skill karyawan
- Mutasi karyawan & tracking mutasi
- Modul laporan (didefinisikan setelah sistem berjalan)

## 2. Role & Hierarki Approval

### 2.1 Role
| Role | Pemegang | Hak Akses |
|---|---|---|
| **Admin** | Ko Yosep, Ko Rudy, Ko Darwin, Ko Leonard, Ci Ika | Melihat & mengelola seluruh data karyawan (aktif & arsip), menu Setting, master data; memproses approval sesuai mapping; mengajukan untuk diri sendiri |
| **Staf** | Karyawan divisi Sales, Engineer, dan Umum (mis. Bu Devi) | Mengisi & melihat data milik sendiri; mengajukan reimburse/cuti/klaim |

Divisi (Sales / Engineer / Umum / Direktur) disimpan di data karyawan dan menentukan tipe
reimburse serta alur approval. Divisi karyawan Admin: Ko Yosep = Engineer, Ko Darwin = Sales,
Ci Ika = Umum, Ko Rudy & Ko Leonard = Direktur.

Setiap orang memiliki akun sendiri. Hak meng-approve ditentukan oleh Mapping
Approval, bukan hanya role Admin.

### 2.2 Mapping Approval — matriks persetujuan v1.14 (2026-09-29)
| Proses | Tingkat 1 | Tingkat 2 (Final) |
|---|---|---|
| Reimburse Sales | Ko Darwin | Ko Leonard |
| Reimburse Engineer | Ko Yosep | Ko Rudy |
| Reimburse Umum & Direktur | Bu Ika | — |
| Cuti (selain divisi Direktur) | Ko Rudy | — |
| Cuti divisi Direktur | **Tanpa approval** (tetap dicatat, tampil sebagai "Direktur cuti" di kalender) | — |
| Klaim kesehatan | Bu Ika | — |
| Expense & revenue project | Sama dengan reimburse | Sama dengan reimburse |
| Sertifikat | Tanpa approval | — |

Pengaju yang merupakan approver tingkat 1 → tingkat itu dilewati (Ko Yosep → Ko Rudy; Ko Darwin →
Ko Leonard). Reimburse/expense/revenue milik Bu Ika sendiri → **langsung disetujui** (keputusan user
2026-09-29). Klaim kesehatan milik Bu Ika → Fallback Ko Rudy **atau** Ko Leonard.

Approval bersifat berurutan. Approval Level 2 (atau level terakhir) adalah final.

## 3. Kebutuhan Fungsional

### 3.1 Master Data Karyawan (EMP)
| ID | Requirement |
|---|---|
| EMP-01 | Menyimpan data karyawan lengkap beserta historis, termasuk tanggal masuk & tanggal keluar |
| EMP-02 | Setiap kolom input memiliki validasi format agar data di database rapi & konsisten |
| EMP-03 | Setiap karyawan memiliki tombol **Resign**: status menjadi Resign, masuk Arsip, data tidak dihapus |
| EMP-04 | Rehire dilakukan Admin dari halaman Arsip ("Aktifkan kembali") → memakai record lama + periode kerja baru. NIK yang sudah dipakai karyawan lain ditolak saat disimpan |
| EMP-05 | Admin melihat semua karyawan (aktif & arsip); Staf hanya data sendiri |
| EMP-06 | **Isi data mandiri:** Admin hanya membuat akun minimal (nama, email, divisi, jabatan, tanggal masuk, role); staf melengkapi sendiri data diri (NIK, KK, NPWP, alamat, dll.), keluarga, dokumen, dan sertifikat. Nama lengkap, jabatan, level, NIP, divisi, role, email login, serta tanggal masuk/keluar hanya bisa diisi/diubah Admin *(keputusan user 2026-09-24; nama/jabatan/level 2026-10-05)* |

### 3.2 Dokumen Karyawan & Keluarga (DOC)
| ID | Requirement |
|---|---|
| DOC-01 | Upload: KTP, KK, NPWP pribadi, Pas foto 4x6, SIM A/C, BPJS Ketenagakerjaan, BPJS Kesehatan, Ijazah + Transkrip, SKCK |
| DOC-02 | Jika sudah menikah: Surat nikah/cerai, KTP suami/istri, Akte kelahiran anak (bisa lebih dari satu) |
| DOC-04 | 12 jenis dokumen dibagi **Kelompok I** (identitas: KTP, KK, NPWP, Pas Foto, BPJS TK, BPJS Kes) dan **Kelompok II** (pendukung: Ijazah/Transkrip, SKCK, SIM, Surat Nikah/Cerai, KTP Pasangan, Akte Anak) *(v1.14)* |
| DOC-03 | Indikator kelengkapan dokumen per karyawan. Wajib: semua dokumen DOC-01 (termasuk SIM & SKCK); jika pernah menikah + surat nikah/cerai; jika Menikah + data & KTP pasangan; akte untuk setiap anak yang didaftarkan *(keputusan user 2026-09-24)* |

### 3.3 Sertifikat & Ijazah (CERT)
| ID | Requirement |
|---|---|
| CERT-01 | Nama, penerbit, nomor, start date (wajib), end date (opsional — seumur hidup), file |
| CERT-02 | Status Aktif / Akan Kadaluarsa (≤30 hari) / Kadaluarsa |
| CERT-03 | Email reminder H-30 sebelum kadaluarsa ke karyawan & Admin |

### 3.4 Inventory / Demo Unit (INV) — DITUNDA (keputusan user 2026-09-25)

> Kode & data tetap ada; modul disembunyikan lewat `FEATURES.inventory` (`src/lib/features.ts`).

| ID | Requirement |
|---|---|
| INV-01 | Nama device, serial number, kategori (demo/backup/inventory), periode support (start–end), data warranty |
| INV-02 | Assign ke karyawan, dengan riwayat serah terima & pengembalian |
| INV-03 | Daftar inventory tampil di profil karyawan |
| INV-04 | Email reminder H-30 sebelum support / warranty berakhir ke Admin |

### 3.5 Reimbursement (RMB)
| ID | Requirement |
|---|---|
| RMB-01 | Nomor reimburse otomatis & unik (`RMB/YYYY/MM/NNNN`) |
| RMB-02 | Satu pengajuan berisi banyak baris transaksi, dikelompokkan per kunjungan (tanggal + company + project / New Acquisition) *(Fase 14)* |
| RMB-03 | Per kunjungan: Date, Company/Customer (dropdown dari master), Project (dropdown project company itu, atau New Acquisition). Per baris: Names–Position, Activities, Location, Type, Receipt (Ya/Tidak), Payment By (Cash/CC), Total |
| RMB-04 | 6 tipe bebas dipilih semua divisi *(v1.14)*. Parkir masuk Allowance; bensin & tol masuk Transport. Tidak ada batas nominal (BR-RMB-14) |
| RMB-05 | Upload kwitansi per baris |
| RMB-06 | Total, subtotal CC, subtotal Cash dihitung otomatis |
| RMB-07 | Approval sesuai §2.2 |
| RMB-08 | Email saat minta approval & saat sudah di-approve |
| RMB-09 | Status terlihat oleh pemohon: Draft, Menunggu L1, Menunggu L2, Disetujui |

### 3.6 Cuti (LV)
| ID | Requirement |
|---|---|
| LV-01 | Menu Setting jatah cuti berdasarkan masa kerja; sistem otomatis menghitung jatah tiap karyawan |
| LV-02 | Masa kerja (tahun penuh) per 1 Januari: 0 tahun = 0 hari; 1–4 tahun = 12 hari; 5–14 tahun = 15 hari; ≥15 tahun = 18 hari (per 1 Jan, 5 / 15 tahun penuh sudah termasuk >5 / >15 tahun — keputusan user 2026-10-02) |
| LV-03 | Carry over maksimal 3 hari per tahun |
| LV-04 | Kalender libur nasional + tambahan libur manual oleh Admin |
| LV-05 | Durasi cuti dihitung dalam hari kerja (tanpa Sabtu, Minggu, hari libur) |
| LV-06 | Nomor otomatis (`LV/YYYY/MM/NNNN`), approval & email sama seperti Reimburse |
| LV-07 | Karyawan melihat saldo: jatah, carry over, terpakai, sisa |
| LV-08 | Pengajuan melebihi sisa saldo ditolak saat submit |
| LV-09 | Tahun genap 1 tahun masa kerja: jatah prorata = 12 − bulan genap 1 tahun (bulan itu tidak dihitung). Masuk Feb 2026 → Feb 2027 dapat 10 hari; masuk Des 2026 → Des 2027 tidak dapat (cutoff), jatah penuh mulai Januari 2028 (keputusan user 2026-09-25) |

### 3.7 Klaim Kesehatan (HC)
| ID | Requirement |
|---|---|
| HC-01 | Plafon tahunan ditetapkan **per karyawan** di menu Setting |
| HC-02 | Kategori: biaya rawat jalan dokter, vitamin, kacamata |
| HC-03 | Klaim wajib nominal + upload invoice. Setiap klaim mencatat **nominal diajukan** dan **nominal disetujui** (diisi approver saat menyetujui, ≤ diajukan) *(v1.14)* |
| HC-04 | Approval Ci Ika (lihat §2.2) |
| HC-05 | Plafon hanya **per tahun** (keputusan user 2026-09-29) — tidak ada plafon bulanan |
| HC-06 | Klaim yang disetujui dibayar penuh, dijadwalkan di bulan approval (tidak dipecah per bulan) |
| HC-07 | Total klaim dibatasi plafon tahunan (periode 1 tahun) |
| HC-08 | Nomor otomatis (`HC/YYYY/MM/NNNN`) & notifikasi email |

### 3.8 Kandidat Karyawan (CAN)
| ID | Requirement |
|---|---|
| CAN-01 | Data & dokumen kandidat sama dengan §3.2 |
| CAN-02 | Status kandidat: Melamar, Interview, Diterima, Ditolak |
| CAN-03 | Kandidat diterima dapat dikonversi menjadi karyawan tanpa input ulang |

### 3.9 Expense & Revenue Project (PRJ)
| ID | Requirement |
|---|---|
| PRJ-01 | Master Customer & Project, jenis: Berjalan / New Acquisition. Semua karyawan boleh menambah customer & project baru; ubah/hapus/nonaktifkan hanya Admin *(Fase 14)* |
| PRJ-02 | Expense per project, kategori CC/Cash, dengan nama customer |
| PRJ-03 | Baris reimburse yang memilih project otomatis terhitung sebagai expense project tersebut |
| PRJ-04 | Expense membutuhkan approval (flow sama dengan Reimburse). **Revenue tidak dipakai** — dihapus dari tampilan & input *(2026-10-05)*; tabel/approval lama tetap ada untuk data historis |

### 3.9a Absensi (ATT) — ditambahkan 2026-09-25
| ID | Requirement |
|---|---|
| ATT-01 | Setiap karyawan aktif clock in & clock out sendiri (satu kali per hari); jam diambil dari server (WIB) dan langsung tercatat |
| ATT-02 | Jam masuk & pulang diatur Admin di Setting (default 08:00–17:00); clock in setelah jam masuk = Terlambat, clock out sebelum jam pulang = Pulang cepat; Sabtu, Minggu, hari libur tidak dihitung |
| ATT-03 | Karyawan melihat riwayat absensi per bulan (hadir, terlambat, tidak clock out, cuti, libur, tidak hadir) |
| ATT-04 | Admin melihat status hari ini & rekap bulanan semua karyawan |
| ATT-05 | Admin dapat mengoreksi / menambah absen (lupa clock in/out) dengan alasan wajib; tercatat di audit log |
| ATT-06 | Appeal untuk satu hari tidak masuk: alasan Sakit / Kunjungan keluar + keterangan, maks 7 hari; approval Bu Ika; setelah disetujui status hari itu berganti sesuai alasan (Fase 14, 2026-10-02) |
| ATT-07 | Tidak hadir tanpa appeal lewat 7 hari → saldo cuti dipotong 1 hari per hari (boleh minus, mengurangi jatah berikutnya) |
| ATT-08 | GPS (absen di dalam/luar kantor) — **ditunda** |

### 3.10 Setting (SET)
| ID | Requirement |
|---|---|
| SET-01 | Manajemen user & role |
| SET-02 | Mapping approval per modul & divisi |
| SET-03 | Setting jatah cuti per masa kerja & batas carry over |
| SET-04 | Setting plafon kesehatan per karyawan per tahun |
| SET-05 | Master data: tipe reimburse per divisi, kategori klaim, libur, customer, project |
| SET-06 | Hak approve berdasarkan mapping approval, bukan role saja |
| SET-07 | Jam kerja (jam masuk & pulang) untuk absensi |

### 3.11 Notifikasi Email (NTF)
| ID | Event | Penerima |
|---|---|---|
| NTF-01 | Pengajuan disubmit | Approver step aktif |
| NTF-02 | Approve non-final | Approver step berikutnya + info ke pemohon |
| NTF-03 | Approve final | Pemohon + semua Admin |
| NTF-04 | Sertifikat / support / warranty H-30 | Karyawan terkait + Admin |

## 4. Kebutuhan Non-Fungsional
| ID | Requirement |
|---|---|
| NF-01 | Web responsif (desktop & HP) |
| NF-02 | Login wajib; akses sesuai role, dicek di server |
| NF-03 | Audit log untuk setiap perubahan data & approval; data **tidak dihapus permanen** (hapus = ditandai terhapus / soft delete, file tetap disimpan) *(v1.14)* |
| NF-04 | File hanya dapat diakses user yang berhak |
| NF-05 | Zona waktu Asia/Jakarta, mata uang IDR |
| NF-06 | Backup database harian |

## 5. Ringkasan Aturan Bisnis
- Cuti (tahun penuh per 1 Jan): 0 th → 0; 1–4 th → 12; 5–14 th → 15; ≥15 th → 18 hari. Carry over maks 3 hari.
- Approval berurutan; level terakhir final; Ko Rudy & Ko Leonard auto-approve.
- Data karyawan resign tidak pernah dihapus.

## 6. Open Issues & Asumsi Development

| No | Isu | Status | Asumsi yang dipakai di kode |
|---|---|---|---|
| OI-01 | Carry over reimburse & kesehatan | Perlu konfirmasi | Tidak ada carry over |
| OI-02 | Masa berlaku carry over cuti | **Terjawab** (2026-09-24) | Carry over (maks 3 hari) berlaku sepanjang tahun berikutnya, hangus 31 Des |
| OI-03 | Periode cuti: tahun kalender atau ulang tahun masuk kerja? Masa kerja rehire? | **Terjawab** (2026-09-24) | **Tahun kalender** (Jan–Des, cutoff 31 Des). Cuti bisa dipakai setelah genap 1 tahun masa kerja; tahun kalender saat genap 1 tahun mendapat jatah prorata 12 − bulan genap 1 tahun (diubah 2026-09-25, LV-09); jatah tahun berikutnya menurut masa kerja per 1 Januari (naik tingkat mulai Januari). Rehire: dihitung ulang dari periode kerja terbaru |
| OI-04 | Pembulatan plafon bulanan kesehatan | **Tidak berlaku** (2026-09-29) | Plafon hanya per tahun, tidak ada plafon bulanan |
| OI-05 | Alur Reject / Revisi | Ditunda | Status REJECTED disiapkan di database, belum ada UI |
| OI-06 | Detail data revenue project | Ditunda | Field minimal: tanggal, deskripsi, nominal |
| OI-07 | Approver untuk Ko Rudy/Leonard/Ci Ika | **Terjawab** | Lihat §2.2 |
| OI-08 | Jenis laporan | Setelah sistem jadi | — |
| OI-09 | Akses Bu Devi | Perlu konfirmasi | Karyawan biasa (divisi Umum), bukan Admin |
| OI-10 | Klaim kesehatan melewati akhir tahun (sisa pembayaran ke tahun berikutnya) | **Tidak berlaku** (2026-09-29) | Klaim dibayar penuh di bulan approval, tidak ada sisa pembayaran |
