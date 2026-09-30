"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarPlus, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { DateInputField, TextareaField } from "@/components/form/fields";
import { FormAlert } from "@/components/form/form-actions";
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
import { formatDate, toJakartaIsoDate } from "@/lib/format";
import { countWorkingDays } from "@/lib/leave";
import { cn } from "@/lib/utils";
import { leaveRequestSchema } from "@/lib/validators/leave";
import { submitLeaveAction } from "./actions";

type Input = z.input<typeof leaveRequestSchema>;
type Output = z.output<typeof leaveRequestSchema>;

/**
 * Dialog "Ajukan Cuti". Jumlah hari kerja dihitung langsung (tanpa Sabtu/Minggu/libur) sebagai
 * pratinjau; angka final & pengecekan saldo tetap dilakukan server.
 */
export function LeaveRequestDialog({
  holidays,
  remaining,
  eligibleFrom,
}: {
  holidays: string[];
  remaining: number;
  /** Tanggal paling awal cuti boleh dimulai (genap 1 tahun masa kerja). */
  eligibleFrom: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const today = toJakartaIsoDate();
  const defaults: Input = { startDate: today, endDate: today, reason: "" };
  const form = useForm<Input, unknown, Output>({ resolver: zodResolver(leaveRequestSchema), defaultValues: defaults });
  const { serverError, pending, submit } = useActionSubmit(form);

  const [startDate, endDate] = useWatch({ control: form.control, name: ["startDate", "endDate"] });
  const holidaySet = useMemo(() => new Set(holidays), [holidays]);
  const tooEarly = typeof startDate === "string" && startDate !== "" && startDate < eligibleFrom;
  const preview =
    typeof startDate === "string" && typeof endDate === "string" && startDate && endDate && endDate >= startDate
      ? countWorkingDays(startDate, endDate, holidaySet)
      : null;

  const onSubmit = form.handleSubmit((values) =>
    submit(
      () => submitLeaveAction(values),
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
        <CalendarPlus aria-hidden /> Ajukan Cuti
      </DialogTrigger>
      <DialogContent>
        <FormProvider {...form}>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Ajukan Cuti</DialogTitle>
              <DialogDescription>Durasi dihitung dalam hari kerja (tanpa Sabtu, Minggu, dan hari libur).</DialogDescription>
            </DialogHeader>
            <FormAlert message={serverError} />
            <div className="grid gap-4 sm:grid-cols-2">
              <DateInputField name="startDate" label="Mulai" required />
              <DateInputField name="endDate" label="Sampai" required />
            </div>
            <p
              role="status"
              className={cn(
                "rounded-lg px-3 py-2 text-sm",
                tooEarly || (preview !== null && preview > remaining) ? "bg-danger-soft text-danger" : "bg-info-soft text-foreground",
              )}
            >
              {tooEarly
                ? `Cuti baru bisa dipakai mulai ${formatDate(`${eligibleFrom}T00:00:00Z`)} (setelah genap 1 tahun masa kerja)`
                : preview === null
                ? "Pilih rentang tanggal."
                : `${preview} hari kerja · sisa saldo ${remaining} hari${preview > remaining ? " — melebihi saldo" : ""}`}
            </p>
            <TextareaField name="reason" label="Alasan / delegasi tugas" required />
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
