"use client";

import { ArrowLeft, FileDown } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Selesai bila semua gambar halaman (mis. logo kop) sudah dimuat / gagal, paling lama `maxMs`. */
function imagesReady(maxMs: number): Promise<void> {
  const pending = [...document.images].filter((img) => !img.complete);
  const loaded = Promise.all(
    pending.map((img) => new Promise<void>((resolve) => {
      img.addEventListener("load", () => resolve(), { once: true });
      img.addEventListener("error", () => resolve(), { once: true });
    })),
  ).then(() => undefined);
  return Promise.race([loaded, new Promise<void>((resolve) => setTimeout(resolve, maxMs))]);
}

/**
 * Tombol "Simpan PDF" lewat dialog print browser (tanpa library PDF). `autoPrint` (ekspor PDF, 2026-11-09): dialog
 * langsung terbuka saat halaman dimuat — pilih "Simpan sebagai PDF" sebagai printer. Menunggu logo kop termuat dulu
 * (2026-11-20) supaya tidak tercetak kosong.
 */
export function PrintToolbar({ backHref, autoPrint = false }: { backHref: string; autoPrint?: boolean }) {
  useEffect(() => {
    if (!autoPrint) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void imagesReady(3_000).then(() => {
        if (!cancelled) window.print();
      });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [autoPrint]);

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-2 print:hidden">
      <a href={backHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> Kembali
      </a>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">Di dialog cetak, pilih &ldquo;Simpan sebagai PDF&rdquo;.</span>
        <Button onClick={() => window.print()}>
          <FileDown aria-hidden /> Simpan PDF
        </Button>
      </div>
    </div>
  );
}
