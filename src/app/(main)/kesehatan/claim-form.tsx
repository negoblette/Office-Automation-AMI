"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { HeartPulse, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import type { z } from "zod";
import { DateInputField, SelectInputField, TextareaField } from "@/components/form/fields";
import { FormAlert } from "@/components/form/form-actions";
import { FormField } from "@/components/form/form-field";
import { RupiahInput } from "@/components/form/rupiah-input";
import { useActionSubmit } from "@/components/form/use-action-submit";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatRupiah, toJakartaIsoDate } from "@/lib/format";
import { healthClaimSchema } from "@/lib/validators/health";
import { submitHealthClaimAction } from "./actions";

type Input = z.input<typeof healthClaimSchema>;
type Output = z.output<typeof healthClaimSchema>;

/** Dialog klaim kesehatan (HC-02, HC-03): kategori, tanggal, nominal, invoice wajib. */
export function HealthClaimDialog({ categories, remaining }: { categories: { value: string; label: string }[]; remaining: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const defaults: Input = {
    categoryId: "",
    claimDate: toJakartaIsoDate(),
    amount: null as unknown as number,
    note: "",
  };
  const form = useForm<Input, unknown, Output>({ resolver: zodResolver(healthClaimSchema), defaultValues: defaults });
  const { serverError, pending, submit } = useActionSubmit(form);
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit((values) =>
    submit(
      () => submitHealthClaimAction(values),
      () => {
        setOpen(false);
        router.refresh();
      },
    ),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset(defaults);
      }}
    >
      <DialogTrigger render={<Button size="lg" />}>
        <HeartPulse aria-hidden /> Ajukan Klaim
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <FormProvider {...form}>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Ajukan Klaim Kesehatan</DialogTitle>
              <DialogDescription>Sisa plafon tahun ini {formatRupiah(remaining)}. Klaim di atas plafon bulanan dibayar bertahap.</DialogDescription>
            </DialogHeader>
            <FormAlert message={serverError} />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectInputField name="categoryId" label="Kategori" required options={categories} />
              <DateInputField name="claimDate" label="Tanggal (sesuai invoice)" required max={toJakartaIsoDate()} />
            </div>
            <FormField label="Nominal" htmlFor="claim-amount" required error={errors.amount?.message}>
              <Controller
                control={form.control}
                name="amount"
                render={({ field }) => <RupiahInput id="claim-amount" value={field.value as number | null} onChange={field.onChange} onBlur={field.onBlur} />}
              />
            </FormField>
            <TextareaField name="note" label="Catatan (opsional)" />
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Batal</DialogClose>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" aria-hidden />}
                Ajukan
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
