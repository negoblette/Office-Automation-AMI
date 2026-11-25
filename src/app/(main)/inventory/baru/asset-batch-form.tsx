"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormProvider, useFieldArray, useForm } from "react-hook-form";
import type { z } from "zod";
import { FormSection } from "@/components/form/fields";
import { FormAlert } from "@/components/form/form-actions";
import { DraftNotice, useFormDraft, useUnsavedChangesGuard } from "@/components/form/unsaved-changes";
import { useActionSubmit } from "@/components/form/use-action-submit";
import { useFeedback } from "@/components/shared/feedback";
import { Button, buttonVariants } from "@/components/ui/button";
import { assetBatchSchema, MAX_ASSET_BATCH } from "@/lib/validators/asset";
import { createAssetsAction } from "../actions";
import { OwnershipNote, type RackOption } from "../asset-dialogs";
import { EMPTY_UNIT, UnitRow } from "../unit-row";

type FormInput = z.input<typeof assetBatchSchema>;
type FormOutput = z.output<typeof assetBatchSchema>;

/**
 * Daftarkan Unit (2026-11-25, permintaan user): beberapa unit milik AMI sekaligus, satu baris per unit — seperti Terima
 * Barang tapi tanpa HAF. Serial number opsional; "Salin" menyalin baris tanpa serial number. Semua tersimpan dalam satu
 * transaksi; serial number yang sudah terdaftar & posisi rak dicek ulang di server dan ditandai di barisnya.
 */
export function AssetBatchForm({ racks, draftKey }: { racks: RackOption[]; draftKey: string }) {
  const router = useRouter();
  const { notify } = useFeedback();
  const form = useForm<FormInput, unknown, FormOutput>({ resolver: zodResolver(assetBatchSchema), defaultValues: { units: [{ ...EMPTY_UNIT }] } });
  const { fields, append, insert, remove } = useFieldArray({ control: form.control, name: "units" });
  const { serverError, pending, submit } = useActionSubmit(form);
  useUnsavedChangesGuard(form.formState.isDirty);
  const draft = useFormDraft(form, draftKey);
  const [incomplete, setIncomplete] = useState(false);
  const unitsError = form.formState.errors.units?.message ?? form.formState.errors.units?.root?.message;
  const full = fields.length >= MAX_ASSET_BATCH;

  const onSubmit = form.handleSubmit(
    (values) => {
      setIncomplete(false);
      submit(
        () => createAssetsAction(values),
        (data) => {
          draft.clear();
          notify(`${data.count} unit terdaftar`);
          router.push("/inventory");
        },
      );
    },
    () => setIncomplete(true),
  );

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        {draft.pendingDraft && <DraftNotice savedAt={draft.pendingDraft.savedAt} onRestore={draft.restore} onDiscard={draft.discard} />}
        <FormAlert message={serverError} />

        <div className="flex flex-col gap-[26px] rounded-2xl bg-card p-5 shadow-card sm:p-6">
          <OwnershipNote />
          <FormSection
            title={`Unit (${fields.length})`}
            description="Satu baris per unit. Serial number boleh dikosongkan. “Salin” membuat baris baru dengan isian yang sama tanpa serial number."
          >
            <ol className="flex flex-col gap-4 sm:col-span-2" aria-label="Unit yang didaftarkan">
              {fields.map((field, index) => (
                <UnitRow
                  key={field.id}
                  index={index}
                  racks={racks}
                  onRemove={fields.length > 1 ? () => remove(index) : undefined}
                  onCopy={full ? undefined : () => insert(index + 1, { ...form.getValues(`units.${index}`), serialNo: "" }, { focusName: `units.${index + 1}.serialNo` })}
                />
              ))}
            </ol>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Button type="button" variant="outline" className="self-start" disabled={full} onClick={() => append({ ...EMPTY_UNIT })}>
                <Plus aria-hidden /> Tambah unit
              </Button>
              {full && <p className="text-xs text-muted-foreground">Maksimal {MAX_ASSET_BATCH} unit sekali daftar.</p>}
              {unitsError && <p className="text-[12.5px] font-semibold text-red-ink">{unitsError}</p>}
            </div>
          </FormSection>
        </div>

        {incomplete && <FormAlert message="Masih ada isian yang belum lengkap. Periksa kolom yang ditandai." />}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link href="/inventory" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Batal
          </Link>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
            Daftarkan {fields.length} Unit
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
