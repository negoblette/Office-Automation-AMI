import type { Metadata } from "next";
import Link from "next/link";
import { BackButton } from "@/components/shared/back-button";
import { StatusScreen } from "@/components/shared/status-screen";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Halaman tidak ditemukan" };

/** URL yang tidak ada (di luar shell aplikasi). `notFound()` dari halaman berlogin memakai (main)/not-found.tsx. */
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col bg-background">
      <StatusScreen
        code="404"
        title="Halaman tidak ditemukan"
        description="Alamat ini tidak ada atau sudah dipindahkan. Periksa lagi alamatnya, atau kembali ke Dashboard."
        actions={
          <>
            <BackButton />
            <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
              Kembali ke Dashboard
            </Link>
          </>
        }
      />
    </main>
  );
}
