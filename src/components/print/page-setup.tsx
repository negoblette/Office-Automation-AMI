/**
 * Ukuran kertas & margin cetak (2026-11-20). Margin atas/bawah `@page` sengaja 0: Chrome hanya menambahkan header/footer
 * (tanggal, judul tab, URL, nomor halaman) bila margin atas atau bawah > 0. Jarak atas/bawah tiap lembar dibuat padding
 * `main` di layout cetak dengan `box-decoration-break: clone` (diulang di setiap lembar, termasuk setelah pindah halaman).
 * Layout cetak memasang A4 tegak; halaman yang butuh lembar mendatar memasang `orientation="landscape"` (aturan yang
 * belakangan menang) — penanda `data-print-landscape` juga melebarkan pratinjau di layar.
 */
export function PrintPageSetup({ orientation = "portrait" }: { orientation?: "portrait" | "landscape" }) {
  return (
    <>
      <style>{`@page { size: A4 ${orientation}; margin: 0 12mm; } @media print { html, body { background: #fff !important; } }`}</style>
      {orientation === "landscape" && <span data-print-landscape hidden />}
    </>
  );
}
