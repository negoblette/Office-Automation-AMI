import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Akses ditolak" };

/** Tujuan redirect `requireAdmin()` untuk Staf yang membuka halaman khusus Admin. */
export default async function AccessDeniedPage() {
  await requireUser();

  return (
    <div className="flex flex-1 items-center justify-center py-10">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl bg-card px-8 py-12 text-center shadow-card">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-danger-soft text-danger">
          <ShieldAlert className="size-7" aria-hidden />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Akses ditolak</h1>
          <p className="text-sm text-muted-foreground">
            Anda tidak memiliki hak akses ke halaman ini. Hubungi Admin jika menurut Anda ini sebuah kesalahan.
          </p>
        </div>
        <Link href="/dashboard" className={buttonVariants({ size: "lg", className: "mt-2 px-4" })}>
          Kembali ke Dashboard
        </Link>
      </div>
    </div>
  );
}
