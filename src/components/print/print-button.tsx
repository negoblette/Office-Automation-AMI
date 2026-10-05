"use client";

import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Tombol cetak / "Simpan sebagai PDF" lewat dialog print browser (tanpa library PDF). */
export function PrintToolbar({ backHref }: { backHref: string }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-2 print:hidden">
      <a href={backHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> Kembali
      </a>
      <Button onClick={() => window.print()}>
        <Printer aria-hidden /> Cetak / Simpan PDF
      </Button>
    </div>
  );
}
