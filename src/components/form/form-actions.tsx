"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";

/** Pesan error umum dari server di atas form. */
export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

/** Tombol Batal + Simpan di bawah form. */
export function FormActions({ pending, submitLabel = "Simpan", cancelHref }: { pending: boolean; submitLabel?: string; cancelHref: string }) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Link href={cancelHref} className={buttonVariants({ variant: "outline", size: "lg" })}>
        Batal
      </Link>
      <Button type="submit" size="lg" disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {submitLabel}
      </Button>
    </div>
  );
}
