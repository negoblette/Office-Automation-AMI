"use client";

import { CalendarPlus, CircleCheckBig, ClipboardCheck, FileCheckCorner, Loader2, PackageCheck, Pencil, Printer, Truck, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Controller, useFormContext } from "react-hook-form";
import type { z } from "zod";
import { DateInputField, SelectInputField, TextareaField, TextInputField } from "@/components/form/fields";
import { FormDialog } from "@/components/form/form-dialog";
import { fieldDescriptionId } from "@/components/form/form-field";
import type { SelectOption } from "@/components/form/select-field";
import { useFeedback } from "@/components/shared/feedback";
import { Button, buttonVariants } from "@/components/ui/button";
import type { ReturnCondition } from "@/generated/prisma/enums";
import { addDaysIso, addMonthsIso, FOLLOW_UP_RESULT_LABEL, type FollowUpResult, MAX_PICKUP_AHEAD_DAYS, maxLoanEnd, RETURN_CONDITION_LABEL } from "@/lib/demo-loan";
import { formatDate, toJakartaIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { deliverDemoLoanSchema, demoLoanExtensionSchema, itemSenderSchema, loanPickupSchema, resolveFollowUpSchema } from "@/lib/validators/demo-loan";
import {
  cancelDemoLoanAction,
  cancelLoanExtensionAction,
  cancelLoanPickupAction,
  markDeliveredAction,
  requestLoanExtensionAction,
  resolveFollowUpAction,
  scheduleLoanPickupAction,
  setItemSenderAction,
} from "./actions";

/** Buka Product Trial Form siap cetak — asli + copy (tab yang sama; tombol Kembali di halaman cetak). */
export function PrintFormLink({ loanId, primary }: { loanId: string; primary?: boolean }) {
  return (
    <Link href={`/cetak/peminjaman/${loanId}`} className={buttonVariants({ size: "lg", variant: primary ? "default" : "outline" })}>
      <Printer aria-hidden /> Cetak Form
    </Link>
  );
}

/** Operational: barang sudah tiba di AMI → Pengecekan Unit (cek tiap unit & taruh kembali di rak). */
export function CheckUnitsLink({ loanId }: { loanId: string }) {
  return (
    <Link href={`/inventory/peminjaman/${loanId}/kembali`} className={buttonVariants({ size: "lg" })}>
      <ClipboardCheck aria-hidden /> Pengecekan Unit
    </Link>
  );
}

/** Hardware Admission Form siap cetak (asli + copy) — terbit saat pengambilan dijadwalkan. */
export function PrintHafLink({ loanId, primary }: { loanId: string; primary?: boolean }) {
  return (
    <Link href={`/cetak/peminjaman/${loanId}/haf`} className={buttonVariants({ size: "lg", variant: primary ? "default" : "outline" })}>
      <FileCheckCorner aria-hidden /> Cetak HAF
    </Link>
  );
}

/**
 * Operational: jadwalkan pengambilan barang (2026-11-19) — tanggal pengambilan & kurir AMI. Nomor HAF terbit; HAF dicetak
 * untuk dibawa kurir. Dipakai lagi untuk mengubah jadwal / kurir selama status Pengambilan (nomor HAF tetap).
 */
export function PickupDialog({
  loanId,
  couriers,
  deliveredAt,
  current,
}: {
  loanId: string;
  couriers: SelectOption[];
  deliveredAt: string | null;
  /** Jadwal sekarang (status Pengambilan) — dialog menjadi "Ubah Jadwal". */
  current: { pickupDate: string; courierId: string | null } | null;
}) {
  const { notify } = useFeedback();
  const today = toJakartaIsoDate();
  return (
    <FormDialog
      trigger={
        <Button size="lg" variant={current ? "outline" : "default"}>
          <Truck aria-hidden /> {current ? "Ubah Jadwal" : "Jadwalkan Pengambilan"}
        </Button>
      }
      title={current ? "Ubah jadwal pengambilan" : "Jadwalkan pengambilan"}
      description={
        current
          ? "Tanggal dan kurir di HAF ikut berubah — cetak ulang HAF bila sudah dicetak. Nomor HAF tetap."
          : "Nomor Hardware Admission Form terbit dan HAF bisa dicetak untuk dibawa kurir. Setelah barang tiba di AMI, isi Pengecekan Unit."
      }
      schema={loanPickupSchema}
      defaults={{ pickupDate: current?.pickupDate ?? today, courierId: current?.courierId ?? "" }}
      submitLabel={current ? "Simpan" : "Jadwalkan & Terbitkan HAF"}
      successMessage={null}
      onSuccess={(data: { hafNumber: string | null }) =>
        notify(current ? "Jadwal pengambilan diperbarui" : `Pengambilan dijadwalkan — HAF ${data.hafNumber ?? ""} siap dicetak`)
      }
      action={(values) => scheduleLoanPickupAction(loanId, values)}
    >
      <DateInputField
        name="pickupDate"
        label="Tanggal pengambilan"
        required
        min={deliveredAt ?? undefined}
        max={addDaysIso(today, MAX_PICKUP_AHEAD_DAYS)}
        hint="Tertulis sebagai Date di HAF."
      />
      <SelectInputField name="courierId" label="Kurir AMI" required options={couriers} placeholder="Pilih karyawan…" hint="Tertulis di kolom Received By pada HAF." />
    </FormDialog>
  );
}

/** Operational: batalkan pengambilan (mis. peminjam belum siap) → kembali Dipinjam; nomor HAF tetap untuk dijadwalkan lagi. */
export function CancelPickupButton({ loanId }: { loanId: string }) {
  const router = useRouter();
  const { confirm, notify } = useFeedback();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="lg"
      variant="ghost"
      disabled={pending}
      onClick={async () => {
        const ok = await confirm({
          title: "Batalkan pengambilan?",
          description: "Status kembali Dipinjam dan pengingat jatuh tempo berlaku lagi. Nomor HAF tetap dipakai saat pengambilan dijadwalkan ulang.",
          confirmLabel: "Batalkan pengambilan",
          cancelLabel: "Kembali",
          tone: "danger",
        });
        if (!ok) return;
        startTransition(async () => {
          const result = await cancelLoanPickupAction(loanId);
          if (result.ok) {
            notify("Pengambilan dibatalkan");
            router.refresh();
          } else notify(result.error, "danger");
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Undo2 aria-hidden />} Batalkan Pengambilan
    </Button>
  );
}

/** Unit yang kembali Rusak / Tidak lengkap & perlu diisi hasil tindak lanjutnya. */
export type FollowUpUnit = { itemId: string; deviceName: string; serialNo: string; condition: ReturnCondition; note: string | null };

type ResolveInput = z.input<typeof resolveFollowUpSchema>;
const RESULTS: FollowUpResult[] = ["RESOLVED", "UNRESOLVED"];
const RESULT_STYLE: Record<FollowUpResult, string> = {
  RESOLVED: "bg-green-soft text-green-deep shadow-[inset_0_0_0_2px_var(--green-deep)]",
  UNRESOLVED: "bg-amber-soft text-amber-deep shadow-[inset_0_0_0_2px_var(--amber)]",
};

/**
 * Operational: selesaikan tindak lanjut (2026-11-20) — hasil tiap unit bermasalah (sudah lengkap / diperbaiki, atau
 * tetap rusak / tidak lengkap) + catatan wajib. Setelah disimpan peminjaman Selesai & unit bebas lagi (dicek di server).
 */
export function ResolveFollowUpDialog({ loanId, units }: { loanId: string; units: FollowUpUnit[] }) {
  return (
    <FormDialog
      wide
      trigger={
        <Button size="lg">
          <CircleCheckBig aria-hidden /> Selesaikan Tindak Lanjut
        </Button>
      }
      title="Selesaikan tindak lanjut"
      description="Isi hasil tiap unit yang kembali rusak / tidak lengkap. Setelah disimpan, peminjaman Selesai dan unit bisa dipinjam lagi; unit yang tetap rusak tetap ditandai di Daftar Unit."
      schema={resolveFollowUpSchema}
      defaults={{ note: "", items: units.map((unit) => ({ itemId: unit.itemId, result: "" as never })) }}
      submitLabel="Simpan & Selesaikan"
      successMessage="Tindak lanjut selesai — peminjaman Selesai"
      action={(values) => resolveFollowUpAction(loanId, values)}
    >
      <ol className="flex flex-col gap-3" aria-label="Unit yang ditindaklanjuti">
        {units.map((unit, index) => (
          <FollowUpUnitField key={unit.itemId} index={index} unit={unit} />
        ))}
      </ol>
      <TextareaField
        name="note"
        label="Catatan tindak lanjut"
        required
        rows={3}
        maxLength={500}
        placeholder="mis. Kabel power dikirim customer 25 Nov, unit sudah dicek ulang"
      />
    </FormDialog>
  );
}

/** Satu unit bermasalah: kondisi & catatan saat dicek, lalu pilihan hasil (radio asli, bisa dipilih dengan keyboard). */
function FollowUpUnitField({ index, unit }: { index: number; unit: FollowUpUnit }) {
  const { control, formState } = useFormContext<ResolveInput>();
  const name = `items.${index}.result` as const;
  const error = formState.errors.items?.[index]?.result?.message;
  return (
    <li className="rounded-[14px] p-3.5 shadow-[inset_0_0_0_1px_var(--edge)]">
      <p className="font-semibold wrap-anywhere text-ink">{unit.deviceName}</p>
      <p className="font-mono text-xs text-ink-3">SN {unit.serialNo}</p>
      <p className="mt-1 text-sm wrap-anywhere text-red-deep">
        {RETURN_CONDITION_LABEL[unit.condition]}
        {unit.note && `: ${unit.note}`}
      </p>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <fieldset className="mt-3" aria-describedby={error ? fieldDescriptionId(name) : undefined}>
            <legend className="mb-2 text-[13px] font-bold text-ink-2">
              Hasil tindak lanjut{" "}
              <span className="text-red-ink" aria-hidden>
                *
              </span>
            </legend>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {RESULTS.map((value, optionIndex) => {
                const checked = field.value === value;
                return (
                  <label
                    key={value}
                    className={cn(
                      "inline-flex min-h-11 cursor-pointer items-center rounded-full bg-white px-4 text-sm font-bold text-ink-2 shadow-[inset_0_0_0_1px_var(--edge)] transition-[box-shadow,background-color,color] duration-200 hover:shadow-[inset_0_0_0_1px_var(--ink)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink",
                      checked && RESULT_STYLE[value],
                      error && !checked && "shadow-[inset_0_0_0_1px_var(--red)]",
                    )}
                  >
                    <input
                      type="radio"
                      name={field.name}
                      value={value}
                      checked={checked}
                      onChange={() => field.onChange(value)}
                      onBlur={field.onBlur}
                      ref={optionIndex === 0 ? field.ref : undefined}
                      className="sr-only"
                    />
                    {FOLLOW_UP_RESULT_LABEL[value]}
                  </label>
                );
              })}
            </div>
            {error && (
              <p id={fieldDescriptionId(name)} className="mt-2 text-[12.5px] font-semibold text-red-ink">
                {error}
              </p>
            )}
          </fieldset>
        )}
      />
    </li>
  );
}

/** Operational: barang sudah diantar → status Dipinjam. Tanggal antar & nama penerima (Received By). */
export function DeliverDialog({ loanId, submittedAt }: { loanId: string; submittedAt: string }) {
  const today = toJakartaIsoDate();
  return (
    <FormDialog
      trigger={
        <Button size="lg">
          <PackageCheck aria-hidden /> Sudah Diantar
        </Button>
      }
      title="Barang sudah diantar"
      description="Status menjadi Dipinjam dan jatuh tempo mulai dipantau. Isi sesuai form yang ditandatangani penerima."
      schema={deliverDemoLoanSchema}
      defaults={{ deliveredAt: today, receivedByName: "" }}
      submitLabel="Simpan"
      successMessage="Peminjaman ditandai sudah diantar"
      action={(values) => markDeliveredAction(loanId, values)}
    >
      <DateInputField name="deliveredAt" label="Tanggal diantar" required min={toJakartaIsoDate(submittedAt)} max={today} />
      <TextInputField name="receivedByName" label="Nama penerima (Received By)" placeholder="mis. Muh Jawad Azzak" hint="Opsional. Sesuai nama di kolom Received By." />
    </FormDialog>
  );
}

/** Operational: pilih siapa yang mengantar barang (tercetak sebagai "Item Sender" di form). */
export function ItemSenderDialog({ loanId, senders, current }: { loanId: string; senders: SelectOption[]; current: string | null }) {
  return (
    <FormDialog
      trigger={
        <Button size="lg" variant={current ? "outline" : "default"}>
          <Truck aria-hidden /> {current ? "Ganti Item Sender" : "Pilih Item Sender"}
        </Button>
      }
      title="Item Sender"
      description="Karyawan yang mengantar barang ke peminjam. Namanya tercetak di Product Trial Form untuk tanda tangan."
      schema={itemSenderSchema}
      defaults={{ itemSenderId: current ?? "" }}
      submitLabel="Simpan"
      successMessage="Item Sender tersimpan"
      action={(values) => setItemSenderAction(loanId, values)}
    >
      <SelectInputField name="itemSenderId" label="Item Sender (pengantar barang)" required options={senders} placeholder="Pilih karyawan…" />
    </FormDialog>
  );
}

/**
 * Ajukan perpanjangan jatuh tempo (Tahap 16.4): pemohon / Operational, selama barang masih dipinjam. Tanggal
 * selesai baru: setelah jatuh tempo sekarang, tidak sebelum hari ini, maks. 2 tahun sejak mulai (dicek ulang di server).
 */
export function ExtendLoanDialog({ loanId, startDate, dueDate }: { loanId: string; startDate: string; dueDate: string }) {
  const { notify } = useFeedback();
  const today = toJakartaIsoDate();
  const earliest = [addDaysIso(dueDate, 1), today].sort().at(-1)!;
  const latest = maxLoanEnd(startDate);
  // Usulan: 1 bulan setelah jatuh tempo (atau setelah hari ini bila sudah lama terlambat), dijepit batas 2 tahun.
  const suggested = [addMonthsIso(addDaysIso(earliest, -1), 1), latest].sort()[0];
  return (
    <FormDialog
      trigger={
        <Button size="lg" variant="outline">
          <CalendarPlus aria-hidden /> Ajukan Perpanjangan
        </Button>
      }
      title="Ajukan perpanjangan"
      description={`Jatuh tempo sekarang ${formatDate(`${dueDate}T00:00:00Z`, "short")}. Perpanjangan perlu disetujui approver Peminjaman Unit (Approval Flow); selama menunggu, jatuh tempo belum berubah.`}
      schema={demoLoanExtensionSchema}
      defaults={{ newDueDate: suggested, reason: "" }}
      submitLabel="Ajukan"
      successMessage={null}
      onSuccess={(data: { approved: boolean }) =>
        notify(data.approved ? "Perpanjangan disetujui — jatuh tempo sudah diperbarui" : "Perpanjangan diajukan, menunggu approval")
      }
      action={(values) => requestLoanExtensionAction(loanId, values)}
    >
      <DateInputField name="newDueDate" label="Tanggal selesai baru (jatuh tempo)" required min={earliest} max={latest} hint="Hari terakhir barang dipinjam. Maksimal 2 tahun sejak tanggal mulai." />
      <TextareaField name="reason" label="Alasan perpanjangan" required rows={3} maxLength={500} placeholder="mis. POC diperpanjang customer sampai akhir bulan" />
    </FormDialog>
  );
}

/** Yang mengajukan: batalkan perpanjangan yang belum diputuskan. */
export function CancelExtensionButton({ extensionId }: { extensionId: string }) {
  const router = useRouter();
  const { confirm, notify } = useFeedback();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={async () => {
        const ok = await confirm({
          title: "Batalkan perpanjangan ini?",
          description: "Pengajuan perpanjangan dihentikan dan jatuh tempo tetap seperti sekarang. Anda bisa mengajukan perpanjangan baru.",
          confirmLabel: "Batalkan perpanjangan",
          cancelLabel: "Kembali",
          tone: "danger",
        });
        if (!ok) return;
        startTransition(async () => {
          const result = await cancelLoanExtensionAction(extensionId);
          if (result.ok) {
            notify("Perpanjangan dibatalkan");
            router.refresh();
          } else notify(result.error, "danger");
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Undo2 aria-hidden />} Batalkan perpanjangan
    </Button>
  );
}

/** Pemohon: ubah / revisi pengajuan yang belum disetujui. */
export function EditLoanLink({ loanId, rejected }: { loanId: string; rejected: boolean }) {
  return (
    <Link href={`/inventory/peminjaman/${loanId}/ubah`} className={buttonVariants({ size: "lg", variant: rejected ? "default" : "outline" })}>
      <Pencil aria-hidden /> {rejected ? "Revisi & Ajukan Ulang" : "Ubah"}
    </Link>
  );
}

/** Pemohon: batalkan pengajuan yang belum disetujui (unit langsung bebas, approval yang menunggu ditutup). */
export function CancelLoanButton({ loanId, borrowerName }: { loanId: string; borrowerName: string }) {
  const router = useRouter();
  const { confirm, notify } = useFeedback();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="lg"
      variant="ghost"
      disabled={pending}
      onClick={async () => {
        const ok = await confirm({
          title: "Batalkan pengajuan ini?",
          description: `Peminjaman ke ${borrowerName} dibatalkan, approval-nya dihentikan, dan unitnya bisa diajukan orang lain. Pengajuan yang dibatalkan tidak bisa diajukan ulang.`,
          confirmLabel: "Batalkan pengajuan",
          cancelLabel: "Kembali",
          tone: "danger",
        });
        if (!ok) return;
        startTransition(async () => {
          const result = await cancelDemoLoanAction(loanId);
          if (result.ok) {
            notify("Pengajuan dibatalkan");
            router.refresh();
          } else notify(result.error, "danger");
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Undo2 aria-hidden />} Batalkan
    </Button>
  );
}
