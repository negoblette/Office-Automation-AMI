"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type LoginInput, loginSchema } from "@/lib/validators/auth";
import { loginAction } from "./actions";

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      // Sukses → server melakukan redirect; yang kembali ke sini hanya pesan error.
      const result = await loginAction(values, callbackUrl);
      if (result?.error) setServerError(result.error);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {serverError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{serverError}</span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="Email kantor Anda"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "email-error" : undefined}
          className="h-10 bg-background px-3"
          {...register("email")}
        />
        {errors.email && (
          <p id="email-error" className="text-xs font-medium text-danger">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? "password-error" : undefined}
          className="h-10 bg-background px-3"
          {...register("password")}
        />
        {errors.password && (
          <p id="password-error" className="text-xs font-medium text-danger">
            {errors.password.message}
          </p>
        )}
      </div>

      <Button type="submit" size="lg" disabled={isPending} className="mt-1 h-10 w-full font-semibold">
        {isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {isPending ? "Memproses…" : "Masuk"}
      </Button>
    </form>
  );
}
