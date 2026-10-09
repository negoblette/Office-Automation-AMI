# Ganti tampilan Dashboard (Office Automation)

Catatan untuk Claude Code. Pasangannya `prototipe-dashboard-oa.html` di folder yang sama.

## Aturan utama

Ini pekerjaan **ganti tampilan saja**.

- Acuan **tampilan**: prototipe. Terapkan seidentik mungkin.
- Acuan **perilaku**: kode project yang sekarang. Tidak ada yang berubah.

Setiap komponen harus bekerja persis seperti sebelum pekerjaan ini: tombol yang sama memicu aksi yang sama, dengan data, validasi, urutan langkah, dan hasil yang sama.

Kalau tampilan di prototipe dan perilaku di project tampak bertentangan, perilaku project yang menang. Jangan menyesuaikan fungsi supaya cocok dengan prototipe.

## Skrip di prototipe hanyalah simulasi

JavaScript di prototipe ada supaya prototipe bisa diklik. Jangan memindahkan logikanya ke project. Semua ini **bukan** acuan perilaku:

- data `SEED` dan isi tabelnya;
- fungsi `decide()`, yaitu setujui dan tolak dengan sekali klik;
- tombol Urungkan;
- cara filter, pencarian, dan pengurutan bekerja;
- urutan keadaan tombol absensi dan hitungan sisa jam kerja;
- Panel uji dan pesan "Belum ada di prototipe".

## Yang boleh diubah

- Kelas, gaya, dan token tema: warna, font, jarak, radius, bayangan.
- Susunan markup untuk keperluan tata letak, selama elemen interaktifnya tetap elemen yang sama dengan handler yang sama.
- Elemen hias baru yang tidak punya fungsi: latar bertitik, lembar putih, jam analog, stempel samar di sidebar, piktogram statistik, stempel TUNTAS dan baris bayangan.
- Animasi dan transisi CSS.

## Yang tidak boleh diubah

- Handler dan isinya, props, state, serta alur data.
- Pemanggilan API, server action, query, validasi, dan skema.
- Rute, tujuan tautan, hak akses, dan pengecekan peran.
- Isi menu, label tombol, teks, kolom tabel, dan urutannya.
- Cara kerja filter, pencarian, pengurutan, dan paginasi.
- Dependensi project. Jangan menambah pustaka, dan pakai ikon yang sudah dipakai project.
- Jumlah fitur. Tidak ada yang ditambah dan tidak ada yang dihapus.

## Peta per komponen

| Komponen | Diambil dari prototipe | Tetap dari project |
| --- | --- | --- |
| Kerangka halaman | latar bertitik, sidebar di atas latar, lembar putih membulat | struktur layout, perilaku responsif |
| Sidebar | warna, jarak, pil menu aktif, gaya ikon, transisi buka-tutup | daftar menu dan submenu, tautan, logika aktif dan buka-tutup |
| Bar atas | tombol pil Ajukan, gaya menu, avatar | isi menu Ajukan dan aksinya, data pengguna, logout |
| Judul halaman | tipografi, breadcrumb, jam analog hias | teks dan tautan |
| Panel absensi | panel biru berbingkai ganda, jam besar, tombol pil dengan ikon bulat | sumber waktu, aksi Clock In dan Clock Out, keadaan dan label tombol, teks status |
| Statistik | satu pita tiga bagian, angka besar, piktogram | angka, teks keterangan, tujuan tautan |
| Antrian | gaya judul, chip, kolom cari, pita kepala tabel, baris, pil kategori, tombol | filter, pencarian, urut, kolom, data, aksi setujui dan tolak |
| Keadaan kosong | stempel TUNTAS dan baris bayangan | kondisi kemunculan dan teksnya |

## Hal di prototipe yang butuh fungsi baru

Jangan dibuat. Tulis di rencana di bawah judul "Tidak diterapkan", lalu tanyakan.

- Tombol Urungkan dan pemberitahuan setelah menyetujui.
- Tombol "Tampilkan semua" pada keadaan tidak ada hasil.
- Chip filter per kategori, kalau filter yang ada bekerja dengan cara lain.
- Cap MASUK dan PULANG, teks sisa jam kerja, dan teks durasi kerja, kalau datanya belum ditampilkan di halaman sekarang.
- Angka di menu Approval pada sidebar, kalau datanya belum tersedia di sana.
- Sapaan dengan nama pengguna, kalau nama belum tersedia di bar atas.
- Menu geser untuk lebar HP, kalau project belum punya.
- Kolom "Alur approval" dua tahap. Tampilkan alur sesuai data yang ada.

## Animasi

Animasi adalah bagian dari desain, tetapi tidak boleh mengubah alur.

**Diterapkan.** CSS saja, menempel pada elemen dan kejadian yang sudah ada: hover dan tekan, transisi warna, urutan muncul saat halaman dibuka (`rise`, `dialin`), menu muncul (`pop`), transisi buka-tutup sidebar, gerak piktogram saat disorot, stempel TUNTAS (`sealin`), baris baru masuk (`rowin`).

**Tanyakan dulu.** Butuh jeda atau JavaScript tambahan: cap DISETUJUI dan DITOLAK sebelum baris hilang (`stamp`, `rowout`), baris bergeser halus saat daftar berubah, angka menghitung naik, angka membesar sesaat (`bump`), kertas keluar dari baki (`fly`).

Jangan menunda, menahan, atau mengubah urutan aksi yang ada demi animasi. Semua animasi mati saat `prefers-reduced-motion: reduce`.

## Ketepatan tampilan

Salin nilai dari CSS prototipe apa adanya: variabel di `:root`, ukuran huruf, jarak, radius, bayangan, dan easing. Jangan dibulatkan dan jangan diganti dengan nilai bawaan framework.

Font: Plus Jakarta Sans untuk antarmuka, IBM Plex Mono untuk jam dan nomor. Muat dengan cara yang dipakai project; di Next.js lewat `next/font/google`.

## Cara kerja

1. Baca kode halaman Dashboard dan komponennya. Catat fungsi tiap komponen: handler, data, dan alurnya.
2. Buat rencana berisi tiga hal: file yang diubah beserta perubahan tampilannya; daftar fungsi per komponen dengan pernyataan bahwa tidak disentuh; daftar "Tidak diterapkan" dan "Tanyakan dulu".
3. Tunggu persetujuan, lalu kerjakan di branch baru.
4. Setelah selesai, periksa diff. Isinya hanya boleh kelas, gaya, token, markup pembungkus, elemen hias, dan CSS. Kalau ada baris handler, pemanggilan data, kondisi logika, atau rute yang berubah, kembalikan baris itu.
5. Jalankan lint, build, dan tes yang ada.

## Selesai jika

- Tampilan cocok dengan prototipe.
- Setiap aksi di halaman memberi hasil yang sama dengan sebelum pekerjaan ini.
- Diff tidak menyentuh logika.
- Lint, build, dan tes lulus, dan tidak ada error di console.
- Bagian yang tidak ada di prototipe, misalnya sertifikat yang akan berakhir, tetap ada dan memakai gaya yang sama.
