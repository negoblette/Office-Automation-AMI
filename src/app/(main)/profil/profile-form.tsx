"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import type { z } from "zod";
import { EmployeePersonalSections } from "@/components/employee/employee-fields";
import { FormSection, ReadOnlyList } from "@/components/form/fields";
import { FormAlert } from "@/components/form/form-actions";
import { useActionSubmit } from "@/components/form/use-action-submit";
import { Button } from "@/components/ui/button";
import { riseStyle } from "@/lib/motion";
import { employeeSelfSchema } from "@/lib/validators/employee";
import { updateProfileAction } from "./actions";

type Input = z.input<typeof employeeSelfSchema>;
type Output = z.output<typeof employeeSelfSchema>;

export type ProfileReadOnly = {
  email: string;
  division: string;
  role: string;
  startDate: string;
  employeeNo: string | null;
  fullName: string;
  position: string;
  level: string | null;
};

export function ProfileForm({
  defaultValues,
  readOnly,
  adminEditHref = null,
  revision = null,
}: {
  defaultValues: Input;
  readOnly: ProfileReadOnly;
  adminEditHref?: string | null;
  /** Perubahan data diri yang ditolak sedang direvisi (form berisi usulan tersebut). */
  revision?: { number: string; reason: string | null; by: string | null } | null;
}) {
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
      <form onSubmit={onSubmit} noValidate className="rise flex flex-col" style={riseStyle(4)} onChange={() => setSaved(false)}>
        <FormAlert message={serverError} />
        {revision && (
          <div role="status" className="mb-4 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm">
            <p className="font-semibold text-danger">Perubahan data diri {revision.number} ditolak{revision.by ? ` oleh ${revision.by}` : ""}.</p>
            {revision.reason && <p className="text-ink-2">Alasan: {revision.reason}</p>}
            <p className="text-ink-3">Form di bawah berisi usulan Anda sebelumnya — perbaiki lalu klik &ldquo;Ajukan Ulang Perubahan&rdquo;.</p>
          </div>
        )}
        <FormSection
          layout="aside"
          title="Akun & Pekerjaan"
          description={
            adminEditHref ? (
              <>
                Bagian ini diisi & diubah Admin.{" "}
                <Link href={adminEditHref} className="font-semibold text-brand hover:underline">
                  Ubah Akun & Pekerjaan
                </Link>
              </>
            ) : (
              "Bagian ini hanya bisa diisi & diubah Admin. Hubungi Admin bila ada yang salah."
            )
          }
        >
          <ReadOnlyList
            items={[
              { label: "Email login", value: readOnly.email },
              { label: "Role", value: readOnly.role },
              { label: "Divisi", value: readOnly.division },
              { label: "Tanggal masuk", value: readOnly.startDate },
              { label: "Nama lengkap", value: readOnly.fullName },
              { label: "Jabatan", value: readOnly.position },
              { label: "NIP", value: readOnly.employeeNo ?? "Belum ada — diisi Admin", muted: !readOnly.employeeNo },
              { label: "Level / grade", value: readOnly.level ?? "—", muted: !readOnly.level },
            ]}
          />
        </FormSection>
        <EmployeePersonalSections layout="aside" />
        <div className="flex flex-col-reverse items-stretch gap-3 pt-1 sm:flex-row sm:items-center sm:justify-end">
          {saved && (
            <p role="status" className="flex items-center gap-1.5 text-sm font-medium text-success">
              <CheckCircle2 className="size-4" aria-hidden /> Perubahan dikirim — menunggu approval Admin
            </p>
          )}
          <Button type="submit" size="lg" disabled={pending}>
            {revision ? "Ajukan Ulang Perubahan" : "Ajukan Perubahan Data Diri"}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
