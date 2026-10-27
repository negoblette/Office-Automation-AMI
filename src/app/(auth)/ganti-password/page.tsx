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
        {/* min-h-11: area sentuh ≥ 44 px untuk tautan teks (audit UI 2026-10-27). */}
        <div className="mt-4 flex justify-center gap-2 text-sm">
          {!user.mustChangePassword && (
            <Link href="/dashboard" className="inline-flex min-h-11 items-center rounded-lg px-3 text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ink">
              Kembali ke dashboard
            </Link>
          )}
          <form action={logoutAction}>
            <button
              type="submit"
              className="inline-flex min-h-11 cursor-pointer items-center rounded-lg px-3 text-muted-foreground hover:text-red-ink hover:underline focus-visible:outline-2 focus-visible:outline-ink"
            >
              Keluar
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
