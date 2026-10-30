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
import { type OvertimeRates, overtimeRateSchema } from "@/lib/validators/overtime";
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

/** Tarif overtime per jam (2026-10-30): weekday & weekend/libur; nominal reimburse overtime = durasi × tarif. */
export function OvertimeRateDialog({ rates }: { rates: OvertimeRates }) {
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
      defaults={{ weekday: rates.weekday || (null as unknown as number), weekend: rates.weekend || (null as unknown as number) }}
      submitLabel="Simpan"
      action={saveOvertimeRateAction}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <HourlyRateField name="weekday" label="Weekday (Senin–Jumat)" />
        <HourlyRateField name="weekend" label="Weekend & hari libur" />
      </div>
      <p className="text-[12.5px] text-ink-3">Tarif per jam, dihitung per menit lalu dibulatkan ke rupiah terdekat. Jenis hari menurut tanggal mulai overtime.</p>
    </FormDialog>
  );
}

function HourlyRateField({ name, label }: { name: keyof OvertimeRates; label: string }) {
  const { control, formState } = useFormContext();
  const error = formState.errors[name]?.message as string | undefined;
  return (
    <FormField label={label} htmlFor={name} required error={error}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <RupiahInput
            id={name}
            value={field.value as number | null}
            onChange={field.onChange}
            onBlur={field.onBlur}
            aria-required
            aria-invalid={error ? true : undefined}
            aria-describedby={fieldDescriptionId(name)}
          />
        )}
      />
    </FormField>
  );
}
