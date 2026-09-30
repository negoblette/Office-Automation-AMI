"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import type { z } from "zod";
import { EmployeePersonalSections } from "@/components/employee/employee-fields";
import { FormSection, ReadOnlyField, TextInputField } from "@/components/form/fields";
import { FormAlert } from "@/components/form/form-actions";
import { useActionSubmit } from "@/components/form/use-action-submit";
import { Button } from "@/components/ui/button";
import { employeeSelfSchema } from "@/lib/validators/employee";
import { updateProfileAction } from "./actions";

type Input = z.input<typeof employeeSelfSchema>;
type Output = z.output<typeof employeeSelfSchema>;

export type ProfileReadOnly = { email: string; division: string; role: string; startDate: string };

export function ProfileForm({ defaultValues, readOnly }: { defaultValues: Input; readOnly: ProfileReadOnly }) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const form = useForm<Input, unknown, Output>({ resolver: zodResolver(employeeSelfSchema), defaultValues });
  const { serverError, pending, submit } = useActionSubmit(form);

  const onSubmit = form.handleSubmit((values) => {
    setSaved(false);
    submit(
      () => updateProfileAction(values),
      () => {
        setSaved(true);
        router.refresh();
      },
    );
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} noValidate className="flex max-w-4xl flex-col gap-6" onChange={() => setSaved(false)}>
        <FormAlert message={serverError} />
        <FormSection title="Akun & Pekerjaan" description="Divisi, role, email login, dan tanggal masuk hanya bisa diubah Admin.">
          <ReadOnlyField label="Email login" value={readOnly.email} />
          <ReadOnlyField label="Role" value={readOnly.role} />
          <ReadOnlyField label="Divisi" value={readOnly.division} />
          <ReadOnlyField label="Tanggal masuk" value={readOnly.startDate} />
          <TextInputField name="fullName" label="Nama lengkap" required />
          <TextInputField name="position" label="Jabatan" required />
          <TextInputField name="employeeNo" label="Nomor karyawan" />
          <TextInputField name="level" label="Level / grade" />
        </FormSection>
        <EmployeePersonalSections />
        <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
          {saved && (
            <p role="status" className="flex items-center gap-1.5 text-sm font-medium text-success">
              <CheckCircle2 className="size-4" aria-hidden /> Data tersimpan
            </p>
          )}
          <Button type="submit" size="lg" disabled={pending}>
            Simpan Data Diri
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
