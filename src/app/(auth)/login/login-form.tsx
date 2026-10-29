"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Loader2 } from "lucide-react";
import { OtpInput } from "@/components/form/otp-input";
import { PasswordInput } from "@/components/form/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type LoginInput, loginSchema } from "@/lib/validators/auth";
import { loginAction } from "./actions";

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const [serverError, setServerError] = useState<string | null>(null);
  // Langkah kedua (MFA, hardening Tahap 5): password benar → minta kode authenticator / kode cadangan.
  const [mfaStep, setMfaStep] = useState(false);
  // Kode 6 digit per kotak, langsung dikirim saat lengkap (2026-10-28); kode cadangan lewat kolom teks biasa.
  const [otp, setOtp] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    setValue,
    setFocus,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", code: "" },
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    if (mfaStep && !values.code) {
      setServerError("Kode verifikasi wajib diisi");
      return;
    }
    startTransition(async () => {
      // Sukses → server melakukan redirect; yang kembali ke sini hanya pesan error.
      const result = await loginAction(values, callbackUrl);
      if (result?.mfa && !mfaStep) setMfaStep(true);
      if (result?.mfa) {
        setValue("code", "");
        setOtp("");
        if (useBackupCode) setTimeout(() => setFocus("code"), 0);
      }
      if (result?.error) setServerError(result.error);
    });
  });

  return (
    // method="post": bila JavaScript belum termuat, browser tidak mengirim email & password lewat URL (2026-10-15).
    <form onSubmit={onSubmit} method="post" noValidate className="flex flex-col gap-5">
      {serverError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{serverError}</span>
        </div>
      )}

      {mfaStep && !useBackupCode && (
        <div className="flex flex-col gap-3">
          <Label htmlFor="code-otp">Kode verifikasi</Label>
          <OtpInput
            id="code-otp"
            label="Kode verifikasi"
            value={otp}
            autoFocus
            disabled={isPending}
            invalid={Boolean(serverError)}
            onChange={(value) => {
              setOtp(value);
              setValue("code", value);
            }}
            onComplete={(value) => {
              setValue("code", value);
              void onSubmit();
            }}
          />
          <p className="text-xs text-muted-foreground">
            Masukkan 6 digit dari Google / Microsoft Authenticator di HP Anda — langsung diperiksa setelah lengkap.
          </p>
        </div>
      )}
      {mfaStep && useBackupCode && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="code">Kode cadangan</Label>
          <Input
            id="code"
            autoComplete="off"
            placeholder="XXXXX-XXXXX"
            aria-required
            className="h-11 bg-background px-3 text-center font-mono tracking-widest uppercase"
            {...register("code")}
          />
          <p className="text-xs text-muted-foreground">Salah satu kode cadangan yang Anda simpan saat mengaktifkan MFA (sekali pakai).</p>
        </div>
      )}

      <div className={mfaStep ? "hidden" : "flex flex-col gap-2"}>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="Email kantor Anda"
          aria-required
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "email-error" : undefined}
          className="h-11 bg-background px-3"
          {...register("email")}
        />
        {errors.email && (
          <p id="email-error" className="text-xs font-medium text-danger">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className={mfaStep ? "hidden" : "flex flex-col gap-2"}>
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          id="password"
          autoComplete="current-password"
          placeholder="Password"
          aria-required
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? "password-error" : undefined}
          className="h-11 bg-background px-3 pr-12"
          {...register("password")}
        />
        {errors.password && (
          <p id="password-error" className="text-xs font-medium text-danger">
            {errors.password.message}
          </p>
        )}
      </div>

      <Button type="submit" size="lg" disabled={isPending || (mfaStep && !useBackupCode && otp.length < 6)} className="mt-1 w-full font-semibold">
        {isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {isPending ? "Memproses…" : mfaStep ? "Verifikasi" : "Masuk"}
      </Button>
      {mfaStep && (
        <button
          type="button"
          className="-mt-2 min-h-11 cursor-pointer rounded-lg text-sm text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ink"
          onClick={() => {
            setUseBackupCode(!useBackupCode);
            setServerError(null);
            setValue("code", "");
            setOtp("");
            if (!useBackupCode) setTimeout(() => setFocus("code"), 0);
          }}
        >
          {useBackupCode ? "Pakai kode dari aplikasi authenticator" : "HP hilang? Pakai kode cadangan"}
        </button>
      )}
      {mfaStep && (
        <button
          type="button"
          className="-mt-2 min-h-11 cursor-pointer rounded-lg text-sm text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ink"
          onClick={() => {
            setMfaStep(false);
            setUseBackupCode(false);
            setOtp("");
            setServerError(null);
            setValue("code", "");
            setValue("password", "");
          }}
        >
          Kembali / ganti akun
        </button>
      )}
    </form>
  );
}
