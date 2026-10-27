"use client";

import { RotateCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { StatusScreen } from "@/components/shared/status-screen";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Isi `error.tsx` (root & shell). Pesan asli error tidak ditampilkan (di produksi Next menyembunyikannya);
 * yang tampil kode `digest` untuk dicocokkan IT dengan log server.
 */
export function ErrorScreen({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusScreen
      code="ERROR"
      title="Halaman gagal dimuat"
      description="Terjadi gangguan saat memuat halaman ini. Data Anda yang sudah tersimpan tetap aman. Coba muat ulang; bila masih gagal, laporkan ke IT beserta kode di bawah."
      actions={
        <>
          <Link href="/dashboard" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Ke Dashboard
          </Link>
          <Button type="button" size="lg" onClick={() => retry()}>
            <RotateCw aria-hidden /> Coba lagi
          </Button>
        </>
      }
      detail={error.digest ? <>Kode error: <span className="font-mono font-semibold text-ink-2 select-all">{error.digest}</span></> : undefined}
    />
  );
}
