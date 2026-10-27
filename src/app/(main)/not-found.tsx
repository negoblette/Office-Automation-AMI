import Link from "next/link";
import { BackButton } from "@/components/shared/back-button";
import { StatusScreen } from "@/components/shared/status-screen";
import { buttonVariants } from "@/components/ui/button";

/** `notFound()` dari halaman berlogin (data dihapus / bukan hak akses / ID salah) — tetap di dalam shell. */
export default function MainNotFound() {
  return (
    <StatusScreen
      code="404"
      title="Data tidak ditemukan"
      description="Data yang Anda buka tidak ada, sudah dihapus, atau bukan milik akun Anda. Bila Anda yakin seharusnya bisa membukanya, hubungi Admin."
      actions={
        <>
          <BackButton />
          <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
            Kembali ke Dashboard
          </Link>
        </>
      }
    />
  );
}
