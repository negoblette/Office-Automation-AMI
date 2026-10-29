"use client";

import { Check, Copy, Download, Loader2 } from "lucide-react";
import { type ReactNode, useState, useTransition } from "react";
import { FormAlert } from "@/components/form/form-actions";
import { OtpInput } from "@/components/form/otp-input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/actions";
import { confirmMfaSetupAction, regenerateBackupCodesAction } from "./actions";

/** Kolom kode 6 digit + tombol; hasil sukses (kode cadangan) diteruskan ke `onDone`. */
function CodeForm({
  label,
  submitLabel,
  action,
  onDone,
}: {
  label: string;
  submitLabel: string;
  action: (code: string) => Promise<ActionResult<string[]>>;
  onDone: (codes: string[]) => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Langsung dikirim saat 6 digit lengkap (2026-10-28); kode salah → kotak dikosongkan untuk dicoba lagi.
  const submit = (value: string) => {
    setError(null);
    startTransition(async () => {
      const result = await action(value);
      if (result.ok) onDone(result.data);
      else {
        setError(result.fieldErrors?.code ?? result.error);
        setCode("");
      }
    });
  };
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit(code);
      }}
    >
      <FormAlert message={error} />
      <div className="flex flex-col gap-3">
        <Label htmlFor="mfa-code">{label}</Label>
        <OtpInput id="mfa-code" label={label} value={code} onChange={setCode} onComplete={submit} disabled={pending} invalid={Boolean(error)} autoFocus />
      </div>
      <Button type="submit" size="lg" disabled={pending || code.length !== 6} className="w-full">
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {submitLabel}
      </Button>
    </form>
  );
}

/** Daftar kode cadangan — hanya tampil sekali, setelah itu yang tersimpan di server hanya hash-nya. */
function BackupCodes({ codes, continueHref }: { codes: string[]; continueHref: string }) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const text = `Kode cadangan MFA Office Automation (masing-masing hanya bisa dipakai sekali)\n\n${codes.join("\n")}\n`;
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg bg-warning-soft px-3 py-2.5 text-sm font-medium text-warning">
        Simpan kode cadangan ini sekarang (pengelola password, atau cetak & simpan di tempat aman). Kode ini hanya
        ditampilkan sekali dan dipakai bila HP Anda hilang.
      </div>
      <ol className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-4 font-mono text-sm">
        {codes.map((code) => (
          <li key={code} className="text-center">
            {code}
          </li>
        ))}
      </ol>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          }}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? "Tersalin" : "Salin"}
        </Button>
        <a
          className={buttonVariants({ variant: "outline", className: "flex-1" })}
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`}
          download="kode-cadangan-mfa.txt"
        >
          <Download aria-hidden /> Unduh .txt
        </a>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} className="size-4" />
        Saya sudah menyimpan kode cadangan ini
      </label>
      {/* Navigasi penuh supaya layout membaca ulang status MFA. */}
      <a href={continueHref} aria-disabled={!saved} className={buttonVariants({ size: "lg", className: saved ? "w-full" : "pointer-events-none w-full opacity-50" })}>
        Lanjut
      </a>
    </div>
  );
}

/** `children` = petunjuk & QR; disembunyikan setelah MFA aktif supaya yang tampil hanya kode cadangan. */
export function MfaSetupForm({ children }: { children: ReactNode }) {
  const [codes, setCodes] = useState<string[] | null>(null);
  if (codes) return <BackupCodes codes={codes} continueHref="/dashboard" />;
  return (
    <div className="flex flex-col gap-5">
      {children}
      <CodeForm label="Kode 6 digit dari aplikasi" submitLabel="Aktifkan MFA" action={confirmMfaSetupAction} onDone={setCodes} />
    </div>
  );
}

export function RegenerateBackupCodesForm() {
  const [codes, setCodes] = useState<string[] | null>(null);
  if (codes) return <BackupCodes codes={codes} continueHref="/mfa" />;
  return <CodeForm label="Kode 6 digit dari aplikasi saat ini" submitLabel="Buat Ulang Kode Cadangan" action={regenerateBackupCodesAction} onDone={setCodes} />;
}
