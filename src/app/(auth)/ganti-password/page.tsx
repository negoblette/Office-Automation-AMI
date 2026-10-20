import type { Metadata } from "next";
import Link from "next/link";
import { logoutAction } from "@/components/layout/actions";
import { requireUser } from "@/lib/auth/guards";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Ganti Password" };

/**
 * Ganti password sendiri. Sengaja di luar layout `(main)`, karena layout itu memanggil
 * `requireUser()` yang mengarahkan akun wajib-ganti ke sini (akan berputar bila di dalamnya).
 */
export default async function GantiPasswordPage() {
  const user = await requireUser({ allowPasswordChange: true });

  return (
    <main className="flex flex-1 items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl bg-card p-6 shadow-card sm:p-8">
          <div className="mb-6 space-y-1">
            <h1 className="text-lg font-semibold text-foreground">Ganti Password</h1>
            <p className="text-sm text-muted-foreground">
              {user.mustChangePassword
                ? "Demi keamanan, ganti password awal Anda sebelum melanjutkan."
                : "Setelah diganti, Anda keluar dari semua perangkat dan perlu masuk lagi."}
            </p>
          </div>
          <ChangePasswordForm />
        </div>
        <div className="mt-6 flex justify-center gap-4 text-sm">
          {!user.mustChangePassword && (
            <Link href="/dashboard" className="text-muted-foreground hover:underline">
              Kembali ke dashboard
            </Link>
          )}
          <form action={logoutAction}>
            <button type="submit" className="text-muted-foreground hover:underline">
              Keluar
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
