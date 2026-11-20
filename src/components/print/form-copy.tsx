// Lembar asli + copy untuk form cetak peminjaman unit (Product Trial Form & Hardware Admission Form, 2026-11-19):
// sekali cetak = 2 lembar A4, lembar kedua bertanda "COPY" di atas judul form.
import { cn } from "@/lib/utils";

/** Tanda "COPY" di atas judul form pada lembar salinan (ikut tercetak). */
export function CopyMark() {
  return <p className="mb-2 border-2 border-black px-3 py-0.5 font-sans text-[17px] leading-tight font-extrabold tracking-[0.3em]">COPY</p>;
}

/** Keterangan lembar di layar ("Lembar 1 dari 2 — asli"); tidak ikut tercetak. */
export function SheetLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("mb-3 text-xs font-semibold tracking-wider text-neutral-500 uppercase print:hidden", className)}>{children}</p>;
}
