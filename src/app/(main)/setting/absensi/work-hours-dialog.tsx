"use client";

import { Pencil } from "lucide-react";
import { Controller, useFormContext } from "react-hook-form";
import { TextInputField } from "@/components/form/fields";
import { FormDialog } from "@/components/form/form-dialog";
import { fieldDescriptionId, FormField } from "@/components/form/form-field";
import { RupiahInput } from "@/components/form/rupiah-input";
import { Button } from "@/components/ui/button";
import type { WorkHours } from "@/lib/attendance";
import { workHoursSchema } from "@/lib/validators/attendance";
import { overtimeRateSchema } from "@/lib/validators/overtime";
import { saveWorkHoursAction } from "../../absensi/actions";
import { saveOvertimeRateAction } from "../../overtime/actions";

export function WorkHoursDialog({ hours }: { hours: WorkHours }) {
  return (
    <FormDialog
      trigger={
        <Button variant="outline" size="lg">
          <Pencil aria-hidden /> Ubah
        </Button>
      }
      title="Ubah Jam Kerja"
      schema={workHoursSchema}
      defaults={hours}
      submitLabel="Simpan"
      action={saveWorkHoursAction}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInputField name="workStart" label="Jam masuk" type="time" required />
        <TextInputField name="workEnd" label="Jam pulang" type="time" required />
      </div>
    </FormDialog>
  );
}

/** Tarif overtime per jam (2026-10-30): nominal reimburse overtime = durasi × tarif ini. */
export function OvertimeRateDialog({ hourlyRate }: { hourlyRate: number }) {
  return (
    <FormDialog
      trigger={
        <Button variant="outline" size="lg">
          <Pencil aria-hidden /> Ubah
        </Button>
      }
      title="Ubah Tarif Overtime"
      description="Berlaku untuk overtime yang di-reimburse setelah ini; reimburse yang sudah disimpan tidak berubah."
      schema={overtimeRateSchema}
      defaults={{ hourlyRate: hourlyRate || (null as unknown as number) }}
      submitLabel="Simpan"
      action={saveOvertimeRateAction}
    >
      <HourlyRateField />
    </FormDialog>
  );
}

function HourlyRateField() {
  const { control, formState } = useFormContext();
  const error = formState.errors.hourlyRate?.message as string | undefined;
  return (
    <FormField label="Tarif per jam" htmlFor="hourlyRate" required error={error} hint="Dihitung per menit, dibulatkan ke rupiah terdekat.">
      <Controller
        control={control}
        name="hourlyRate"
        render={({ field }) => (
          <RupiahInput
            id="hourlyRate"
            value={field.value as number | null}
            onChange={field.onChange}
            onBlur={field.onBlur}
            aria-required
            aria-invalid={error ? true : undefined}
            aria-describedby={fieldDescriptionId("hourlyRate")}
          />
        )}
      />
    </FormField>
  );
}
