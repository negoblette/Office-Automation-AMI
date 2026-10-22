"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import type { z } from "zod";
import { CheckboxField, TextInputField } from "@/components/form/fields";
import { FormAlert } from "@/components/form/form-actions";
import { useActionSubmit } from "@/components/form/use-action-submit";
import { Button } from "@/components/ui/button";
import { PASSWORD_MIN_LENGTH } from "@/lib/password-policy";
import { recoveryKeySchema, recoveryKeyTestSchema } from "@/lib/validators/recovery-key";
import { createRecoveryKeyAction, testRecoveryKeyAction } from "./actions";

function SuccessNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="flex items-center gap-1.5 text-sm font-medium text-success">
      <CheckCircle2 className="size-4 shrink-0" aria-hidden /> {children}
    </p>
  );
}

type KeyInput = z.input<typeof recoveryKeySchema>;
type KeyOutput = z.output<typeof recoveryKeySchema>;

/** Buat / ganti kata sandi pemulihan. */
export function RecoveryKeyForm({ hasKey }: { hasKey: boolean }) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const form = useForm<KeyInput, unknown, KeyOutput>({
    resolver: zodResolver(recoveryKeySchema),
    defaultValues: { passphrase: "", confirmPassphrase: "", loginPassword: "", acknowledged: false },
  });
  const { serverError, pending, submit } = useActionSubmit(form);

  return (
    <FormProvider {...form}>
      <form
        noValidate
        className="flex flex-col gap-5"
        onChange={() => setSaved(false)}
        onSubmit={form.handleSubmit((values) =>
          submit(
            () => createRecoveryKeyAction(values),
            () => {
              form.reset();
              setSaved(true);
              router.refresh();
            },
          ),
        )}
      >
        <FormAlert message={serverError} />
        <TextInputField
          name="passphrase"
          label={hasKey ? "Kata sandi pemulihan baru" : "Kata sandi pemulihan"}
          type="password"
          autoComplete="new-password"
          required
          hint={`Minimal ${PASSWORD_MIN_LENGTH} karakter dan berbeda dari password login. Paling mudah berupa kalimat yang hanya Anda tahu (boleh memakai spasi).`}
        />
        <TextInputField name="confirmPassphrase" label="Ulangi kata sandi pemulihan" type="password" autoComplete="new-password" required />
        <TextInputField
          name="loginPassword"
          label="Password login Anda"
          type="password"
          autoComplete="current-password"
          required
          hint="Untuk memastikan yang menyimpan benar-benar Anda."
        />
        <CheckboxField
          name="acknowledged"
          label="Saya paham: bila kata sandi ini lupa dan pemegang kunci lainnya juga lupa, data pribadi karyawan tidak bisa dipulihkan."
        />
        <div className="flex flex-wrap items-center justify-end gap-3">
          {saved && <SuccessNote>Kunci pemulihan tersimpan. Semua Admin menerima email pemberitahuan.</SuccessNote>}
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Menyimpan…" : hasKey ? "Ganti Kunci Pemulihan" : "Simpan Kunci Pemulihan"}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}

type TestInput = z.input<typeof recoveryKeyTestSchema>;
type TestOutput = z.output<typeof recoveryKeyTestSchema>;

/** Uji kata sandi pemulihan — memastikan masih ingat, tanpa mengubah apa pun. */
export function RecoveryTestForm() {
  const router = useRouter();
  const [passed, setPassed] = useState(false);
  const form = useForm<TestInput, unknown, TestOutput>({ resolver: zodResolver(recoveryKeyTestSchema), defaultValues: { testPassphrase: "" } });
  const { serverError, pending, submit } = useActionSubmit(form);

  return (
    <FormProvider {...form}>
      <form
        noValidate
        className="flex flex-col gap-5"
        onChange={() => setPassed(false)}
        onSubmit={form.handleSubmit((values) =>
          submit(
            () => testRecoveryKeyAction(values),
            () => {
              form.reset();
              setPassed(true);
              router.refresh();
            },
          ),
        )}
      >
        <FormAlert message={serverError} />
        <TextInputField name="testPassphrase" label="Kata sandi pemulihan" type="password" autoComplete="off" required />
        <div className="flex flex-wrap items-center justify-end gap-3">
          {passed && <SuccessNote>Kata sandi pemulihan benar.</SuccessNote>}
          <Button type="submit" variant="outline" size="lg" disabled={pending}>
            {pending ? "Memeriksa…" : "Uji Kata Sandi"}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
