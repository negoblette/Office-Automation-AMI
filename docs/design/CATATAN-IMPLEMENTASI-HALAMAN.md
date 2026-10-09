# Ganti tampilan halaman selain Dashboard (Office Automation), versi tenang

Catatan untuk Claude Code. Pasangannya `prototipe-halaman-oa.html` di folder yang sama.
Ini lanjutan `CATATAN-IMPLEMENTASI-DASHBOARD.md`. Aturan di sana tetap berlaku, kecuali yang disebut berbeda di sini.

Catatan ini menggantikan catatan halaman yang lama, yaitu versi yang memakai piktogram, cap status, cincin persen, dan stempel "BELUM ADA". Kalau berkas lama masih ada di folder, abaikan.

## Aturan utama

Ini pekerjaan **ganti tampilan saja**.

- Acuan **tampilan**: prototipe.
- Acuan **perilaku dan isi**: kode project yang sekarang.

Teks, label, kolom, isian, urutan, rute, dan aksi tiap komponen tetap dari project. Kalau ada teks, kolom, atau tombol di prototipe yang berbeda dari project, project yang benar. Posisi komponen di tiap halaman juga tetap; yang diganti bungkus dan gayanya.

## Arah tampilan: tenang

Halaman kerja dipakai setiap hari, jadi tampilannya tidak boleh ramai.

- Yang membawa tampilan: huruf, jarak, dan satu aksen biru.
- Warna selain biru hanya untuk arti status: baik (hijau), perlu perhatian (kuning), salah (merah). Selain itu netral.
- Tidak ada gambar hias. Tidak ada piktogram, stempel, jam analog, baris bayangan, cincin persen, atau label kapital bergaya cap.
- Permukaan lembut dipakai hanya kalau isinya memang satu kelompok. Paling banyak satu atau dua per halaman, dan tidak ada panel di dalam panel.
- Gerak hanya untuk menanggapi tindakan atau menandai isi yang berganti.
- Kalau ragu antara menambah hiasan atau tidak, jangan tambah.

## Cara membaca prototipe

- Satu berkas berisi 13 halaman. Tiap halaman adalah `<section class="view" data-route="...">`.
- CSS diurutkan per bagian 0 sampai 19, masing-masing diberi komentar.
- Judul halaman, breadcrumb, dan tab digambar skrip dari daftar `ROUTES` dan `TABS`. Itu cara kerja prototipe, bukan acuan.
- Seluruh JavaScript adalah simulasi. Jangan dipindahkan ke project.
- Kotak kuning "Catatan prototipe" (`.pnote`), Panel uji (`.lab`), dan pesan `.hint` bukan bagian desain.

| Halaman di prototipe (`data-route`) | Rute di project |
| --- | --- |
| `absensi` | `/absensi` |
| `profil`, `profil-dokumen`, `profil-sertifikat`, `profil-aset` | `/profil`, `/profil/dokumen`, `/profil/sertifikat`, `/profil/aset` |
| `karyawan`, `karyawan-arsip` | `/karyawan`, `/karyawan/arsip` |
| `kandidat` | `/kandidat` |
| `reimburse`, `reimburse-baru` | `/reimburse`, `/reimburse/baru` |
| `cuti`, `cuti-saldo`, `cuti-kalender` | `/cuti`, `/cuti/saldo`, `/cuti/kalender` |

## Hubungan dengan Dashboard

Isi halaman Dashboard tidak diubah. Jam analog di judul halaman, panel biru dengan capnya, pita angka besar dengan piktogram, antrian approval, dan stempel TUNTAS tetap seperti sekarang.

Kerangka (sidebar dan bar atas) hanya ada satu untuk semua halaman. Karena itu dua hal di bawah ikut terlihat di Dashboard. Tulis keduanya di rencana supaya pemilik project bisa menolak.

1. **Tombol biru** adalah satu komponen. Bayangan berpendar di bawahnya dihapus, diganti bayangan tipis. Saat hover warnanya menggelap ke `--blue-deep`, bukan dicerahkan dengan `filter`.
2. **Stempel samar di sidebar** dihapus. Lihat "Perbaikan kerangka".

Beberapa gaya dasar di halaman kerja berbeda dari Dashboard. Buat sebagai varian supaya Dashboard tidak ikut berubah.

| Gaya | Di Dashboard (tetap) | Di halaman kerja (prototipe ini) |
| --- | --- | --- |
| Angka pita `.stat-num` | 48px, dengan piktogram | 32px, angka saja |
| Label `.tag` | pil kategori berwarna dengan ikon | netral, tiga warna hanya untuk status, tanpa ikon |
| Avatar `.av` | warna mengikuti kategori pengajuan | satu warna: `--blue-soft` dan `--blue-deep` |
| Jam analog hias di judul halaman | ada | tidak digambar |
| Judul bagian | dengan ubin ikon `.q-ico` | teks saja |
| Gerak masuk `.rise` | 0,7 detik, giliran 70ms | 0,45 detik, giliran 30ms per blok |

Komponen lain yang sudah ada di Dashboard dipakai ulang apa adanya: kerangka, judul halaman, chip, kolom cari, tabel, kalender. Kalau gayanya masih tertulis langsung di halaman Dashboard, pindahkan dulu menjadi komponen bersama tanpa mengubah tampilan dan fungsi Dashboard. Jangan menulis gaya yang sama dua kali.

## Gaya di prototipe ini

- Tombol: `.btn-blue`, `.btn-line`, `.btn-tint`, `.ghost`, `.btn-sm`, `.linkish`, `.icon-btn`.
- Tab: `.seg`, `.seg.sm`, hitungan `.cnt`.
- Pita: `.stats` dan `.stat`, `.band` (kelengkapan), `.saldo` dengan `.days` dan `.facts`.
- Filter dan isian: `.tools`, `.search`, `.chips`, `.field`, `.input`, `.select`, `.textarea`, `.help`, `.err`, `.affix`.
- Tabel: `.tbl`, `.who`, `.av`, `.num`, `.amt-cell`, `.when`, `.go`, `.foot`.
- Status: `.tag`, `.rate`, `.quiet`.
- Keadaan kosong: `.empty`, `.nomatch`.
- Form: `.record`, `.fgrid`, `.tray`, `.line`, `.tray-foot`, `.sum`, `.total`.
- Dokumen: `.grp-label`, `.slots`, `.slot`, `.drop`, `.filed`.
- Samping: `.cols`, `.aside`, `.dist`.
- Kalender dan dua form di bawahnya: `.cal-panel`, `.day`, `.ev`, `.legend`, `.pair`.
- Dialog dan pesan: `.overlay`, `.dialog`, `.slip`, `.toast`.

Token baru di `:root`: `--red`, `--red-ink`, `--red-soft`, `--red-deep`, `--red-ring`, `--scrim`, `--tone-soft`. Token lain sama dengan Dashboard.

## Aturan gaya untuk semua halaman

Berlaku juga untuk halaman yang belum ada di prototipe.

1. **Kartu putih berbingkai dihapus.** Isi diletakkan langsung di lembar. Permukaan lembut (`--panel`, radius 22) hanya untuk pita angka, pita kelengkapan, pita saldo cuti, kalender, dan baki untuk kelompok isian yang berulang.
2. **Kartu statistik berjajar** menjadi satu pita `.stats` dengan beberapa `.stat`. Isinya label, angka, satuan, dan paling banyak satu baris keterangan. Tanpa ikon dan tanpa gambar. Empat bagian memakai `.stats.four`.
3. **Label huruf besar** (kepala tabel, label isian, label statistik) kehilangan `uppercase` dan jarak hurufnya. Teksnya tampil apa adanya dari kode.
4. **Judul bagian** berupa teks: judul dan satu kalimat penjelas dari project. Ubin ikon hanya dipakai kalau bagian itu di project memang sudah punya ikon, contohnya kalender.
5. **Tab** memakai `.seg`: pita lembut, pilihan aktif putih. Komponen tab project tetap dipakai, hanya gayanya yang diganti.
6. **Tombol** semuanya pil. Utama `.btn-blue`, kedua yang netral `.btn-line`, kedua yang masih satu alur `.btn-tint`, polos `.ghost`. Satu kelompok tindakan hanya punya satu tombol biru. Tidak ada tombol dengan bulatan ikon di dalamnya selain tombol Clock In di panel biru.
7. **Isian** tinggi 46px, radius 14, garis `--edge`, fokus biru dengan cincin. Label di atas, bantuan dan pesan salah di bawah. Isian yang salah bergaris merah. Data yang dikunci tampil sebagai `.record`, bukan isian mati.
8. **Tabel** memakai pita kepala dan baris tanpa garis dengan sorot membulat saat disentuh. Tinggi baris seragam. Nomor dan jam memakai huruf mono. Nominal rata kanan.
9. **Status** memakai `.tag`. Tanpa ikon, tanpa titik warna, tanpa huruf kapital.

   | Nada | Kelas | Contoh nilai |
   | --- | --- | --- |
   | netral | `.tag` | Belum clock in, Draft, Melamar, Belum ada, Dikembalikan, peran, kategori |
   | baik | `.tag.good` | Hadir, Disetujui, Diterima, Ada, Dipegang |
   | perlu perhatian | `.tag.warn` | Terlambat, Menunggu, Interview, Akan kadaluarsa |
   | salah | `.tag.bad` | Tidak hadir, Ditolak |

10. **Persen** tampil sebagai angka `.rate`, bukan cincin. **Batang** `.meter` hanya di tempat project sudah menampilkan batang kelengkapan. **Perbandingan antar kelompok** memakai batang tanpa lintasan (`.dist i`): panjangnya saja yang berbicara.
11. **Avatar inisial** satu warna untuk semua orang.
12. **Keadaan kosong** hanya teks kosong milik project, rata tengah, dengan ruang yang cukup. Tanpa gambar.
13. **Dialog** memakai `.overlay` dan `.dialog`.
14. **Gerak.** Yang dipakai: isi halaman naik sedikit saat dibuka (`.rise`), isi tabel atau kalender memudar masuk saat berganti (`.fresh`), baris baru masuk (`.enter`, `.filed`), batang bergerak ke nilai baru, dan tanggapan tekan pada tombol. Tidak ada angka menghitung naik, tidak ada baris masuk bergiliran, tidak ada gerak yang berulang sendiri. `prefers-reduced-motion` mematikan semuanya.

## Peta per halaman

| Halaman | Yang diganti | Yang tetap dari project |
| --- | --- | --- |
| Absensi | Kartu absensi memakai komponen panel biru yang sama dengan Dashboard. Judul halaman tanpa jam analog. Tiga kartu menjadi satu pita angka. Riwayat memakai judul bagian dengan navigasi bulan `.monthnav`. Tabel: tanggal tebal, jam mono, status `.tag`, tombol Appeal `.btn-line.btn-sm` di sel status | Aksi clock in dan out, navigasi bulan dan labelnya, data baris, aksi Appeal |
| Profil: Data Diri | Kelengkapan menjadi pita `.band`: judul, persen, batang, lalu kalimat "Belum diisi" dari project. "Akun & Pekerjaan" menjadi `.record` langsung di lembar. Form Data Diri langsung di lembar dengan `.fgrid` | Daftar isian, jenis isian, validasi, tombol simpan, tombol Download Biodata |
| Profil: Dokumen & Keluarga | Kelengkapan menjadi pita `.band`. Tiap kelompok: label `.grp-label`, lalu kisi tiga kolom `.slots` tanpa panel. Tiap dokumen satu `.slot`: nama, `.tag` keadaan, tombol unggah bergaris putus `.drop`. Sesudah ada berkas tampil `.filed` | Daftar dokumen, alur unggah, keadaan sesudah ada berkas, bagian Keluarga |
| Profil: Sertifikat, Aset | Judul bagian teks dan keadaan kosong teks. Tambah Sertifikat memakai `.btn-tint` | Form tambah, daftar dan kolomnya |
| Karyawan | Empat kartu menjadi `.stats.four`. Tab `.seg` dengan hitungan. Tabel memakai `.tag` netral untuk peran dan `.rate` untuk persen. Distribusi Divisi menjadi `.aside` dengan batang tanpa lintasan | Kolom, urut, cari, filter divisi, tombol Arsip dan Tambah Karyawan |
| Arsip | Tabel dan keadaan kosong | Kolom, cari |
| Kandidat | Tiga kartu menjadi pita, chip status, tabel dengan `.tag` status, keadaan kosong | Filter status, kolom, tombol Kandidat |
| Reimburse | Baris filter tanpa kartu (`.tools`). Tiga kartu menjadi pita. Tabel dengan nominal `.amt-cell` dan `.tag` status | Filter bulan dan karyawan, cetak, filter status, kolom, tautan baris |
| Pengajuan Reimburse | Tiap Kunjungan menjadi baki `.tray`. Tiap Baris di dalamnya dipisah garis (`.line`), bukan kotak di dalam kotak. Pilihan Ya/Tidak memakai `.seg.sm`. Subtotal di `.tray-foot`, total di `.total` | Semua isian, pilihan, validasi, hitungan, tombol, bagian bawah form |
| Cuti | Kartu saldo menjadi pita lembut `.saldo`, bukan panel biru: judul, teks periode, angka sisa, deret hari `.days`, empat angka `.facts`. Filter bulan memakai `.tools`. Tabel dengan `.tag` status, keadaan kosong | Angka saldo, teks periode, filter, kolom, tombol Ajukan Cuti |
| Saldo Cuti | Tabel: angka mono rata kanan, nol redup, sisa tebal | Kolom, aksi penyesuaian |
| Kalender Libur | Kalender memakai gaya yang sudah ada di Dashboard. Dua form di bawah menjadi dua kolom dengan garis pemisah (`.pair`), tanpa kartu | Isian, tombol, dan aksi kedua form |

Panel biru hanya dipakai di dua tempat: absensi di Dashboard dan absensi di halaman Absensi.

## Bagian yang tidak terlihat di screenshot

Jangan dihapus dan jangan dikarang. Pakai isi dari project, beri gaya yang sama dengan bagian di sekitarnya.

- Form Data Diri: daftar isian di prototipe diambil dari teks "Belum diisi".
- Bagian Keluarga di halaman Dokumen & Keluarga.
- Bagian bawah form Pengajuan Reimburse: total dan tombol kirim.
- Isian lain dan tombol pada "Tambah Hari Libur" dan "Impor Daftar Libur".
- Kolom tabel Karyawan sesudah kolom Dokumen.
- Tab Rekap Karyawan, semua form tambah, dialog, dan halaman detail.

## Yang hanya contoh di prototipe

- Data contoh dari Panel uji: isi tabel Sertifikat, Aset, Arsip, Kandidat, Cuti, tambahan baris Reimburse, persen di Karyawan, acara di kalender, dan isi bulan lain di Absensi.
- Kolom tabel Sertifikat dan Aset, termasuk penanda dua tahap verifikasi di tabel Sertifikat.
- Label tebakan: Simpan, Simpan Draft, Ajukan, Tambah, Impor, Hapus, label "Ada", "Total pengajuan", "Akhir pekan", isi dialog Appeal.
- Tombol hapus baris dan hapus kunjungan pada form reimburse.

## Tanyakan dulu

Tulis di rencana, jangan langsung dikerjakan.

1. Dua perubahan yang ikut terlihat di Dashboard: tombol biru tanpa bayangan berpendar dan stempel sidebar dihapus.
2. Deret hari `.days` di pita saldo cuti. Ini butuh menggambar satu ruas per hari dari angka yang sudah ada (sisa, menunggu, terpakai). Kalau tidak disetujui, pakai satu batang `.meter`.
3. Baris akhir pekan yang redup di tabel Absensi. Hanya kalau project memang sudah membedakan akhir pekan.
4. Ambang warna `.rate`. Ikuti ambang yang sudah dipakai project. Kalau project belum punya, tampilkan netral.
5. Nilai status yang tidak ada di tabel nada di atas.
6. Distribusi Divisi turun ke bawah tabel pada lebar di bawah 1560px.
7. Gerak yang butuh pemicu JavaScript: `.fresh` saat isi tabel berganti dan `.enter` saat baris form ditambah. Kalau ragu, lewati.

## Keputusan

Jawaban pemilik project untuk "Tanyakan dulu" (9 Oktober 2026):

1. Setuju. Tombol biru tanpa bayangan berpendar dan stempel sidebar dihapus, termasuk di Dashboard.
2. Setuju memakai deret hari `.days`, asal hanya dari angka yang sudah ada di halaman.
3. Baris akhir pekan: ikuti yang sudah ada di project. Jangan menambah logika.
4. Ambang warna `.rate`: pakai ambang yang sudah ada di project. Kalau belum ada, netral.
5. Nilai status di luar tabel nada: pakai netral, lalu daftarnya disebutkan ke pemilik project.
6. Setuju. Distribusi Divisi turun ke bawah tabel pada lebar di bawah 1560px.
7. Gerak `.fresh` dan `.enter`: dilewati dulu.

Keputusan tambahan saat rencana putaran 1:

8. Dashboard dikunci. Label status dan keadaan kosong di Dashboard memakai varian lama khusus Dashboard. Dialog tetap ikut gaya baru karena dipakai bersama halaman Approval.

## Perbaikan kerangka yang terlihat di screenshot

1. Stempel samar di sidebar menimpa menu Approval, Setting, dan Laporan. Di versi tenang stempel itu dihapus. Kalau pemilik project ingin stempel tetap ada, beri ruang sendiri di bawah menu supaya tidak menimpa apa pun.
2. Submenu aktif tampil dengan kotak garis hitam. Itu cincin fokus. Cincin fokus hanya untuk `:focus-visible`; tanda aktif adalah pil putih.
3. Induk submenu aktif cukup tebal dengan ikon biru (`.nav.cur`), tanpa latar putih.
4. Label "Karyawan & Dokumen" terpotong karena batang gulir sidebar. Sembunyikan batang gulirnya; sidebar tetap bisa digulir.

## Di luar pekerjaan ini

Teks project tidak diubah. Sebagai catatan saja: beberapa teks memakai tanda pisah panjang, yaitu keterangan halaman Absensi, "Belum ada — diisi Admin", "Kelompok I — Identitas", dan "Kelompok II — Pendukung". Menggantinya dengan titik, koma, atau titik dua adalah perubahan teks, jadi hanya dikerjakan kalau pemilik project memintanya.

## Cara kerja

Kerjakan satu kelompok per putaran, masing-masing dengan rencana yang disetujui dulu.

1. Komponen bersama dan perbaikan kerangka.
2. Absensi.
3. Reimburse dan Pengajuan Reimburse.
4. Cuti, Saldo Cuti, Kalender Libur.
5. Karyawan, Arsip, Kandidat.
6. Empat tab Profil Saya.

Rencana tiap putaran memuat: file yang diubah dan perubahan tampilannya; fungsi tiap komponen dengan pernyataan bahwa tidak disentuh; daftar "Tidak diterapkan" dan "Tanyakan dulu".

Sesudah selesai, periksa diff. Isinya hanya boleh kelas, gaya, token, markup pembungkus, dan CSS. Baris handler, pemanggilan data, kondisi logika, teks, atau rute yang ikut berubah harus dikembalikan. Lalu jalankan lint, build, dan tes yang ada.

## Selesai jika

- Tampilan tiap halaman cocok dengan prototipe pada lebar 1920, 1440, dan 400.
- Tidak ada piktogram, stempel, cincin persen, atau label kapital bergaya cap di halaman selain Dashboard.
- Setiap aksi memberi hasil yang sama dengan sebelum pekerjaan ini.
- Tidak ada teks, kolom, isian, atau tombol project yang hilang atau berubah.
- Diff tidak menyentuh logika, lint dan build lulus, tidak ada error di console.
- Isi halaman Dashboard tetap sama, kecuali dua hal yang disetujui di "Tanyakan dulu" nomor 1.
