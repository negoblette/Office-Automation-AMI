"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FormProvider, useForm } from "react-hook-form";
import type { z } from "zod";
import { TextInputField } from "@/components/form/fields";
import { FormAlert } from "@/components/form/form-actions";
import { useActionSubmit } from "@/components/form/use-action-submit";
import { Button } from "@/components/ui/button";
import { PASSWORD_MIN_LENGTH } from "@/lib/password-policy";
import { changePasswordSchema } from "@/lib/validators/auth";
import { changePasswordAction } from "./actions";

type Input = z.input<typeof changePasswordSchema>;
type Output = z.output<typeof changePasswordSchema>;

export function ChangePasswordForm() {
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const { serverError, pending, submit } = useActionSubmit(form);

  // Sukses → server logout & mengarahkan ke /login; yang kembali ke sini hanya error.
  const onSubmit = form.handleSubmit((values) => submit(() => changePasswordAction(values), () => {}));

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <FormAlert message={serverError} />
        <TextInputField name="currentPassword" label="Password saat ini" type="password" autoComplete="current-password" required />
        <TextInputField
          name="newPassword"
          label="Password baru"
          type="password"
          autoComplete="new-password"
          required
          hint={`Minimal ${PASSWORD_MIN_LENGTH} karakter. Paling mudah berupa kalimat yang hanya Anda tahu (boleh memakai spasi).`}
        />
        <TextInputField name="confirmPassword" label="Ulangi password baru" type="password" autoComplete="new-password" required />
        <Button type="submit" size="lg" disabled={pending} className="w-full">
          {pending ? "Menyimpan…" : "Simpan Password Baru"}
        </Button>
      </form>
    </FormProvider>
  );
}
