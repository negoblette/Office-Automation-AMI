import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { logoutAction } from "@/components/layout/actions";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { BACKUP_CODE_COUNT, getMfaStatus, startMfaSetup } from "@/lib/services/mfa";
import { MfaSetupForm, RegenerateBackupCodesForm } from "./mfa-forms";

export const metadata: Metadata = { title: "Keamanan Akun (MFA)" };

/**
 * Verifikasi dua langkah (hardening Tahap 5). Di luar layout `(main)` karena `requireUser()` di layout itu
 * mengarahkan user yang belum mendaftarkan MFA ke sini (akan berputar bila di dalamnya).
 */
export default async function MfaPage() {
  const user = await requireUser({ allowMfaSetup: true });
  const status = await getMfaStatus(prisma, user.id);
  const setup = !status.enabled && status.required ? await startMfaSetup(prisma, user.id) : null;
  const qr = setup ? await QRCode.toDataURL(setup.uri, { margin: 1, width: 220 }) : null;

  return (
    <main className="flex flex-1 items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-2xl bg-card p-6 shadow-card sm:p-8">
          <div className="mb-6 space-y-1">
            <h1 className="text-lg font-semibold text-foreground">Verifikasi Dua Langkah (MFA)</h1>
            <p className="text-sm text-muted-foreground">
              {setup
                ? "Semua akun wajib memakai kode dari HP saat login. Daftarkan aplikasi authenticator Anda sebelum melanjutkan."
                : status.enabled
                  ? "Setiap login meminta kode 6 digit dari aplikasi authenticator di HP Anda."
                  : "MFA tidak diwajibkan untuk akun ini."}
            </p>
          </div>

          {setup && qr && (
            <MfaSetupForm>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-foreground">
                <li>Pasang <strong>Google Authenticator</strong> atau <strong>Microsoft Authenticator</strong> di HP.</li>
                <li>Di aplikasi, pilih tambah akun → pindai kode QR di bawah.</li>
                <li>Ketik kode 6 digit yang muncul di aplikasi.</li>
              </ol>
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL QR, bukan gambar dari server */}
              <img src={qr} alt="Kode QR untuk aplikasi authenticator" width={220} height={220} className="mx-auto rounded-lg border border-line bg-white p-2" />
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">Tidak bisa memindai? Ketik kunci ini di aplikasi</summary>
                <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-center font-mono text-sm break-all select-all">{setup.secret.match(/.{1,4}/g)?.join(" ")}</p>
                <p className="mt-1 text-xs text-muted-foreground">Jenis: berbasis waktu (time-based), 6 digit.</p>
              </details>
            </MfaSetupForm>
          )}

          {status.enabled && (
            <div className="flex flex-col gap-5">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-success-soft px-3 py-2">
                  <dt className="text-xs text-muted-foreground">Status</dt>
                  <dd className="font-semibold text-success">Aktif</dd>
                  {status.enabledAt && <dd className="text-xs text-muted-foreground">sejak {formatDateTime(status.enabledAt)}</dd>}
                </div>
                <div className={`rounded-lg px-3 py-2 ${status.backupRemaining <= 3 ? "bg-warning-soft" : "bg-muted"}`}>
                  <dt className="text-xs text-muted-foreground">Kode cadangan tersisa</dt>
                  <dd className="font-semibold">
                    {status.backupRemaining} dari {BACKUP_CODE_COUNT}
                  </dd>
                </div>
              </dl>
              <div className="space-y-2">
                <h2 className="text-sm font-semibold">Buat ulang kode cadangan</h2>
                <p className="text-xs text-muted-foreground">Kode cadangan lama langsung tidak berlaku. HP hilang dan kode cadangan habis? Minta Admin me-reset MFA Anda.</p>
                <RegenerateBackupCodesForm />
              </div>
            </div>
          )}
        </div>

        {/* min-h-11: area sentuh ≥ 44 px untuk tautan teks (audit UI 2026-10-27). */}
        <div className="mt-4 flex justify-center gap-2 text-sm">
          {!user.mustSetupMfa && (
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
