import Image from "next/image";
import logo from "@/assets/brand/artha-mitra-logo.png";
import { COMPANY } from "@/lib/company";
import { cn } from "@/lib/utils";

/**
 * Kop dokumen cetak (2026-11-20): logo Artha Mitra Interdata, judul, lalu keterangan (`children`). Dipakai rekap reimburse,
 * rekap klaim kesehatan, biodata. Product Trial Form & HAF punya kop sendiri (tata letak form kertas AMI).
 * Logo dimuat langsung (bukan lazy) supaya ikut tercetak di setiap halaman, juga saat dialog cetak terbuka otomatis.
 */
export function PrintLetterhead({
  title,
  aside,
  children,
  className,
}: {
  title: React.ReactNode;
  /** Teks kecil di kanan logo, mis. tanggal cetak. */
  aside?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-5 border-b-2 border-black pb-3", className)}>
      <div className="flex items-end justify-between gap-6">
        <Image src={logo} alt={COMPANY.name} loading="eager" className="h-auto w-[48mm]" />
        {aside && <div className="text-right text-xs text-black/60">{aside}</div>}
      </div>
      <h1 className="mt-3 text-2xl font-bold">{title}</h1>
      {children}
    </header>
  );
}
