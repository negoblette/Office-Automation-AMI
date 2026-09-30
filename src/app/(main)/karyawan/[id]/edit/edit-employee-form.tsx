"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { FormProvider, useForm } from "react-hook-form";
import type { z } from "zod";
import { EmployeeAccountSection, EmployeePersonalSections } from "@/components/employee/employee-fields";
import { FormActions, FormAlert } from "@/components/form/form-actions";
import { useActionSubmit } from "@/components/form/use-action-submit";
import type { EmployeeFormValues } from "@/lib/services/employee-queries";
import { employeeAdminUpdateSchema } from "@/lib/validators/employee";
import { updateEmployeeAction } from "../../actions";

type Input = z.input<typeof employeeAdminUpdateSchema>;
type Output = z.output<typeof employeeAdminUpdateSchema>;

export function EditEmployeeForm({ employeeId, defaultValues }: { employeeId: string; defaultValues: EmployeeFormValues }) {
  const router = useRouter();
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(employeeAdminUpdateSchema),
    defaultValues,
  });
  const { serverError, pending, submit } = useActionSubmit(form);

  const onSubmit = form.handleSubmit((values) =>
    submit(() => updateEmployeeAction(employeeId, values), () => router.push(`/karyawan/${employeeId}`)),
  );

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} noValidate className="flex max-w-4xl flex-col gap-6">
        <FormAlert message={serverError} />
        <EmployeeAccountSection mode="edit" />
        <EmployeePersonalSections />
        <FormActions pending={pending} submitLabel="Simpan Perubahan" cancelHref={`/karyawan/${employeeId}`} />
      </form>
    </FormProvider>
  );
}
