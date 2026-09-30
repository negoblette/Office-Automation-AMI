"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { FormProvider, useForm } from "react-hook-form";
import type { z } from "zod";
import { EmployeeAccountSection } from "@/components/employee/employee-fields";
import { FormActions, FormAlert } from "@/components/form/form-actions";
import { useActionSubmit } from "@/components/form/use-action-submit";
import { toJakartaIsoDate } from "@/lib/format";
import { employeeCreateSchema } from "@/lib/validators/employee";
import { createEmployeeAction } from "../actions";

type Input = z.input<typeof employeeCreateSchema>;
type Output = z.output<typeof employeeCreateSchema>;

export function CreateEmployeeForm() {
  const router = useRouter();
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(employeeCreateSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      role: "STAFF",
      division: undefined,
      position: "",
      startDate: toJakartaIsoDate(),
    },
  });
  const { serverError, pending, submit } = useActionSubmit(form);

  const onSubmit = form.handleSubmit((values) =>
    submit(() => createEmployeeAction(values), () => router.push("/karyawan")),
  );

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} noValidate className="flex max-w-4xl flex-col gap-6">
        <FormAlert message={serverError} />
        <EmployeeAccountSection mode="create" />
        <p className="text-sm text-muted-foreground">
          Data diri (NIK, KK, NPWP, alamat, keluarga, dokumen) dilengkapi sendiri oleh karyawan setelah login.
        </p>
        <FormActions pending={pending} submitLabel="Buat Akun" cancelHref="/karyawan" />
      </form>
    </FormProvider>
  );
}
