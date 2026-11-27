"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, RotateCcw, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { DateInputField, TextareaField, TextInputField } from "@/components/form/fields";
import { FormAlert } from "@/components/form/form-actions";
import { useActionSubmit } from "@/components/form/use-action-submit";
import { useFeedback } from "@/components/shared/feedback";
import { Button } from "@/components/ui/button";
import { holidayImportSchema, holidaySchema } from "@/lib/validators/leave";
import { addHolidayAction, deleteHolidayAction, importHolidaysAction, restoreHolidayAction } from "../actions";

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
  const { notify } = useFeedback();

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
                notify(`Hari libur "${values.name}" ditambahkan`);
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
  const { confirm, notify } = useFeedback();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      aria-label={`Hapus ${name}`}
      onClick={async () => {
        const ok = await confirm({
          title: `Hapus hari libur "${name}"?`,
          description: 'Tanggal ini dihitung sebagai hari kerja lagi. Bisa dikembalikan dari daftar "Dikeluarkan" di bawah daftar libur.',
          confirmLabel: "Hapus",
          tone: "danger",
        });
        if (!ok) return;
        startTransition(async () => {
          const result = await deleteHolidayAction(id);
          if (result.ok) {
            notify("Hari libur dihapus");
            router.refresh();
          } else notify(result.error, "danger");
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 />}
    </Button>
  );
}

/** Kembalikan libur yang dikeluarkan Admin (2026-11-27). */
export function RestoreHolidayButton({ id, name, fromSync }: { id: string; name: string; fromSync: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { confirm, notify } = useFeedback();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      aria-label={`Kembalikan ${name}`}
      onClick={async () => {
        const ok = await confirm({
          title: `Kembalikan hari libur "${name}"?`,
          description: fromSync
            ? "Tanggal ini dihitung sebagai hari libur lagi dan kembali mengikuti kalender Google (bila Google mengganti nama / membatalkannya, ikut berubah)."
            : "Tanggal ini dihitung sebagai hari libur lagi.",
          confirmLabel: "Kembalikan",
        });
        if (!ok) return;
        startTransition(async () => {
          const result = await restoreHolidayAction(id);
          if (result.ok) {
            notify(`Hari libur "${name}" dikembalikan`);
            router.refresh();
          } else notify(result.error, "danger");
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCcw aria-hidden />} Kembalikan
    </Button>
  );
}
