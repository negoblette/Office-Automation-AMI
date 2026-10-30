"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarPlus, Loader2, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { DateInputField, SelectInputField, TextareaField } from "@/components/form/fields";
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
import type { Gender, LeaveType } from "@/generated/prisma/enums";
import { formatDate, toJakartaIsoDate } from "@/lib/format";
import { LEAVE_TYPE_LABEL } from "@/lib/labels";
import { countWorkingDays } from "@/lib/leave";
import { cn } from "@/lib/utils";
import { defaultDeductDays, LEAVE_TYPES, leaveRequestSchema } from "@/lib/validators/leave";
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
  gender,
  revise,
}: {
  holidays: string[];
  remaining: number;
  /** Tanggal paling awal cuti boleh dimulai (genap 1 tahun masa kerja). */
  eligibleFrom: string;
  /** Jenis kelamin karyawan — menentukan jatah cuti melahirkan (2026-10-30); null = belum diisi di Profil. */
  gender: Gender | null;
  /** Revisi cuti yang ditolak (2026-10-12): isi awal + diajukan ulang dengan nomor yang sama. */
  revise?: { id: string; number: string; type: LeaveType; startDate: string; endDate: string; reason: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const today = toJakartaIsoDate();
  const defaults: Input = revise
    ? { type: revise.type, startDate: revise.startDate, endDate: revise.endDate, reason: revise.reason }
    : { type: "ANNUAL", startDate: today, endDate: today, reason: "" };
  const form = useForm<Input, unknown, Output>({ resolver: zodResolver(leaveRequestSchema), defaultValues: defaults });
  const { serverError, pending, submit } = useActionSubmit(form);

  const [type, startDate, endDate] = useWatch({ control: form.control, name: ["type", "startDate", "endDate"] });
  const holidaySet = useMemo(() => new Set(holidays), [holidays]);
  const preview =
    typeof startDate === "string" && typeof endDate === "string" && startDate && endDate && endDate >= startDate
      ? countWorkingDays(startDate, endDate, holidaySet)
      : null;
  // Hari yang memotong saldo (2026-10-30): tahunan semua, kematian 0, melahirkan hanya yang melewati jatah gratis
  // (laki-laki 2 / perempuan 90 hari kerja). Syarat 1 tahun & sisa saldo hanya untuk yang dipotong; server mengecek ulang.
  const leaveType = type ?? "ANNUAL";
  const needsGender = leaveType === "MATERNITY" && !gender;
  const deductDays = preview === null ? (leaveType === "ANNUAL" ? 1 : 0) : defaultDeductDays(leaveType, preview, gender);
  const tooEarly = deductDays > 0 && typeof startDate === "string" && startDate !== "" && startDate < eligibleFrom;
  const overBalance = preview !== null && deductDays > remaining;
  // Saldo tidak cukup / belum genap 1 tahun / jenis kelamin belum diisi → tombol Ajukan nonaktif.
  const blocked = needsGender || tooEarly || overBalance;

  const onSubmit = form.handleSubmit((values) =>
    submit(
      () => submitLeaveAction(values, revise?.id ?? null),
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
      {revise ? (
        <DialogTrigger render={<Button size="sm" variant="outline" />}>
          <Pencil aria-hidden /> Revisi
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button size="lg" />}>
          <CalendarPlus aria-hidden /> Ajukan Cuti
        </DialogTrigger>
      )}
      <DialogContent>
        <FormProvider {...form}>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{revise ? `Revisi Cuti ${revise.number}` : "Ajukan Cuti"}</DialogTitle>
              <DialogDescription>Durasi dihitung dalam hari kerja (tanpa Sabtu, Minggu, dan hari libur).</DialogDescription>
            </DialogHeader>
            <FormAlert message={serverError} />
            <SelectInputField name="type" label="Jenis cuti" required options={LEAVE_TYPES.map((value) => ({ value, label: LEAVE_TYPE_LABEL[value] }))} />
            <div className="grid gap-4 sm:grid-cols-2">
              <DateInputField name="startDate" label="Mulai" required />
              <DateInputField name="endDate" label="Sampai" required />
            </div>
            <p
              role="status"
              className={cn(
                "rounded-lg px-3 py-2 text-sm",
                blocked ? "bg-danger-soft text-danger" : "bg-info-soft text-foreground",
              )}
            >
              {needsGender
              ? "Isi jenis kelamin di Profil → Data Diri dulu; jatah cuti melahirkan bergantung pada jenis kelamin (laki-laki 2 hari kerja, perempuan 90 hari kerja)."
              : tooEarly
              ? `Cuti baru bisa dipakai mulai ${formatDate(`${eligibleFrom}T00:00:00Z`)} (setelah genap 1 tahun masa kerja)`
              : preview === null
              ? "Pilih rentang tanggal."
              : leaveType === "ANNUAL"
              ? `${preview} hari kerja · sisa saldo ${remaining} hari${overBalance ? " — saldo tidak cukup, kurangi tanggal cuti" : ""}`
              : deductDays === 0
              ? `${preview} hari kerja · tidak memotong saldo cuti`
              : `${preview} hari kerja · ${preview - deductDays} hari jatah cuti melahirkan, ${deductDays} hari dipotong dari saldo (sisa ${remaining} hari)${overBalance ? " — saldo tidak cukup, kurangi tanggal cuti" : ""}`}
            </p>
            <TextareaField name="reason" label="Alasan / delegasi tugas" required />
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Batal</DialogClose>
              <Button type="submit" disabled={pending || blocked}>
                {pending && <Loader2 className="animate-spin" aria-hidden />}
                {revise ? "Ajukan Ulang" : "Ajukan"}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
