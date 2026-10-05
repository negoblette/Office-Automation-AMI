/** Layout halaman cetak (tanpa sidebar/topbar) — mis. Biodata Karyawan untuk disimpan sebagai PDF. */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-[210mm] bg-white px-6 py-8 text-black print:max-w-none print:p-0">{children}</main>;
}
