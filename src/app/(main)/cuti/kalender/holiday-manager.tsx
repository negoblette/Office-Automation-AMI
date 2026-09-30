"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { DateInputField, TextareaField, TextInputField } from "@/components/form/fields";
import { FormAlert } from "@/components/form/form-actions";
import { useActionSubmit } from "@/components/form/use-action-submit";
import { Button } from "@/components/ui/button";
import { holidayImportSchema, holidaySchema } from "@/lib/validators/leave";
import { addHolidayAction, deleteHolidayAction, importHolidaysAction } from "../actions";

function NationalToggle({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-primary" />
      Libur nasional (bukan tambahan kantor)
    </label>
  );
}

/** Form tambah satu libur + impor banyak libur (Admin, LV-04). */
export function HolidayForms() {
  const router = useRouter();
  const single = useForm<z.input<typeof holidaySchema>, unknown, z.output<typeof holidaySchema>>({
    resolver: zodResolver(holidaySchema),
    defaultValues: { date: "", name: "", isNational: false },
  });
  const bulk = useForm<z.input<typeof holidayImportSchema>, unknown, z.output<typeof holidayImportSchema>>({
    resolver: zodResolver(holidayImportSchema),
    defaultValues: { text: "", isNational: true },
  });
  const singleSubmit = useActionSubmit(single);
  const bulkSubmit = useActionSubmit(bulk);
  const [importResult, setImportResult] = useState<string | null>(null);
  const singleNational = useWatch({ control: single.control, name: "isNational" });
  const bulkNational = useWatch({ control: bulk.control, name: "isNational" });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <FormProvider {...single}>
        <form
          noValidate
          className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-card"
          onSubmit={single.handleSubmit((values) =>
            singleSubmit.submit(
              () => addHolidayAction(values),
              () => {
                single.reset({ date: "", name: "", isNational: values.isNational });
                router.refresh();
              },
            ),
          )}
        >
          <h2 className="text-base font-semibold">Tambah Hari Libur</h2>
          <FormAlert message={singleSubmit.serverError} />
          <div className="grid gap-4 sm:grid-cols-2">
            <DateInputField name="date" label="Tanggal" required />
            <TextInputField name="name" label="Nama" required placeholder="mis. Cuti bersama" />
          </div>
          <NationalToggle value={singleNational} onChange={(v) => single.setValue("isNational", v)} />
          <Button type="submit" className="w-fit" disabled={singleSubmit.pending}>
            Tambah
          </Button>
        </form>
      </FormProvider>

      <FormProvider {...bulk}>
        <form
          noValidate
          className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-card"
          onSubmit={bulk.handleSubmit((values) =>
            bulkSubmit.submit(
              () => importHolidaysAction(values),
              (result) => {
                setImportResult(`${result.added} libur ditambahkan${result.skipped ? `, ${result.skipped} dilewati (sudah ada)` : ""}.`);
                bulk.reset({ text: "", isNational: values.isNational });
                router.refresh();
              },
            ),
          )}
        >
          <h2 className="text-base font-semibold">Impor Daftar Libur</h2>
          <FormAlert message={bulkSubmit.serverError} />
          <TextareaField
            name="text"
            label="Satu libur per baris"
            required
            className="[&_textarea]:min-h-32 [&_textarea]:font-mono"
            placeholder={"2027-01-01 Tahun Baru Masehi\n2027-02-06 Tahun Baru Imlek"}
            hint='Format: "YYYY-MM-DD Nama libur". Tanggal yang sudah ada dilewati.'
          />
          <NationalToggle value={bulkNational} onChange={(v) => bulk.setValue("isNational", v)} />
          {importResult && <p className="text-sm font-medium text-success">{importResult}</p>}
          <Button type="submit" className="w-fit" disabled={bulkSubmit.pending}>
            <Upload aria-hidden /> Impor
          </Button>
        </form>
      </FormProvider>
    </div>
  );
}

export function DeleteHolidayButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      aria-label={`Hapus ${name}`}
      onClick={() => {
        if (!window.confirm(`Hapus hari libur "${name}"?`)) return;
        startTransition(async () => {
          const result = await deleteHolidayAction(id);
          if (result.ok) router.refresh();
          else window.alert(result.error);
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
    </Button>
  );
}
