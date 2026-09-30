"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormProvider, useFieldArray, useForm } from "react-hook-form";
import type { z } from "zod";
import { TextInputField } from "@/components/form/fields";
import { FormAlert } from "@/components/form/form-actions";
import { useActionSubmit } from "@/components/form/use-action-submit";
import { Button } from "@/components/ui/button";
import { leavePolicySettingSchema } from "@/lib/validators/leave";
import { saveLeaveSettingsAction } from "./actions";

type Input = z.input<typeof leavePolicySettingSchema>;
type Output = z.output<typeof leavePolicySettingSchema>;

/** Jatah cuti per masa kerja + batas carry over (LV-01, LV-03). */
export function LeaveSettingsForm({ defaultValues }: { defaultValues: Input }) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const form = useForm<Input, unknown, Output>({ resolver: zodResolver(leavePolicySettingSchema), defaultValues });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "policies" });
  const { serverError, pending, submit } = useActionSubmit(form);

  return (
    <FormProvider {...form}>
      <form
        noValidate
        className="flex max-w-3xl flex-col gap-6"
        onChange={() => setSaved(false)}
        onSubmit={form.handleSubmit((values) =>
          submit(
            () => saveLeaveSettingsAction(values),
            () => {
              setSaved(true);
              router.refresh();
            },
          ),
        )}
      >
        <FormAlert message={serverError} />
        <section className="rounded-2xl bg-card p-5 shadow-card sm:p-6">
          <h2 className="mb-1 text-base font-semibold">Jatah Cuti per Masa Kerja</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Masa kerja dalam tahun penuh per 1 Januari (tahun genap 1 tahun dihitung 1). Rentang harus mulai dari 0, berurutan, dan baris terakhir tanpa batas atas.
          </p>
          <div className="flex flex-col gap-3">
            {fields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-[1fr_1fr_1fr_auto] items-start gap-3">
                <TextInputField name={`policies.${index}.minYears`} label="Dari (tahun)" type="number" min={0} inputMode="numeric" />
                <TextInputField name={`policies.${index}.maxYears`} label="Sampai (tahun)" type="number" min={0} inputMode="numeric" placeholder="tanpa batas" />
                <TextInputField name={`policies.${index}.days`} label="Jatah (hari)" type="number" min={0} inputMode="numeric" />
                <Button type="button" variant="ghost" size="icon-sm" className="mt-7" aria-label="Hapus baris" disabled={fields.length <= 1} onClick={() => remove(index)}>
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => append({ minYears: "", maxYears: "", days: "" })}>
            <Plus aria-hidden /> Tambah rentang
          </Button>
        </section>

        <section className="rounded-2xl bg-card p-5 shadow-card sm:p-6">
          <h2 className="mb-4 text-base font-semibold">Carry Over</h2>
          <TextInputField
            name="maxCarryOver"
            label="Maksimal hari dibawa ke tahun berikutnya"
            type="number"
            min={0}
            inputMode="numeric"
            className="max-w-xs"
            hint="Carry over berlaku sepanjang tahun berikutnya, lalu hangus 31 Desember."
          />
        </section>

        <div className="flex items-center justify-end gap-3">
          {saved && (
            <p role="status" className="flex items-center gap-1.5 text-sm font-medium text-success">
              <CheckCircle2 className="size-4" aria-hidden /> Tersimpan. Berlaku untuk saldo tahun yang baru terbentuk.
            </p>
          )}
          <Button type="submit" size="lg" disabled={pending}>
            Simpan
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
