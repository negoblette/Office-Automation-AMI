"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** Kembali ke halaman sebelumnya; tanpa riwayat (link dibuka di tab baru) → ke `fallbackHref`. */
export function BackButton({ fallbackHref = "/dashboard", label = "Halaman sebelumnya" }: { fallbackHref?: string; label?: string }) {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallbackHref);
      }}
    >
      <ArrowLeft aria-hidden /> {label}
    </Button>
  );
}
