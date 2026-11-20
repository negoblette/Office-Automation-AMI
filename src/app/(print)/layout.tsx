import { PrintPageSetup } from "@/components/print/page-setup";

/**
 * Layout halaman cetak (tanpa sidebar/topbar) — mis. Biodata Karyawan untuk disimpan sebagai PDF. Saat dicetak, jarak
 * atas/bawah 10 mm di setiap lembar berasal dari padding di sini (lihat `PrintPageSetup`: tanpa header/footer browser).
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-[210mm] bg-white px-6 py-8 text-black has-[[data-print-landscape]]:max-w-[297mm] print:max-w-none print:box-decoration-clone print:px-0 print:py-[10mm]">
      <PrintPageSetup />
      {children}
    </main>
  );
}
