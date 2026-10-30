"use client";

import { Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormAlert } from "@/components/form/form-actions";
import { FormField } from "@/components/form/form-field";
import { RupiahInput } from "@/components/form/rupiah-input";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatRupiah } from "@/lib/format";
import { approveAction } from "./actions";

/**
 * Tombol "Setujui" + dialog konfirmasi dengan catatan opsional. Klaim kesehatan: isian nominal disetujui.
 * Cuti (2026-10-30): isian "Hari dipotong dari saldo", awalnya sesuai jenis cuti & jenis kelamin.
 * Reimburse overtime (2026-10-30): approver mengisi nominal tiap sesi overtime.
 */
export function ApproveButton({
  requestId,
  label,
  requestedAmount = null,
  leaveDeduct = null,
  overtimeLines = null,
}: {
  requestId: string;
  label: string;
  requestedAmount?: number | null;
  /** Cuti: hari dipotong dari saldo saat ini & jumlah hari kerja; null = bukan cuti. */
  leaveDeduct?: { days: number; workingDays: number } | null;
  /** Reimburse overtime: baris yang nominalnya diisi di sini; null = bukan reimburse overtime. */
  overtimeLines?: { itemId: string; label: string; amount: number | null }[] | null;
}) {
  const initialOvertime = () => Object.fromEntries((overtimeLines ?? []).map((line) => [line.itemId, line.amount]));
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [approvedAmount, setApprovedAmount] = useState<number | null>(requestedAmount);
  const [deductDays, setDeductDays] = useState(String(leaveDeduct?.days ?? ""));
  const [overtimeAmounts, setOvertimeAmounts] = useState<Record<string, number | null>>(initialOvertime);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      if (requestedAmount !== null && (!approvedAmount || approvedAmount > requestedAmount)) {
        setError(`Nominal disetujui harus lebih dari 0 dan maksimal ${formatRupiah(requestedAmount)}`);
        return;
      }
      const days = Number(deductDays);
      if (leaveDeduct && (deductDays.trim() === "" || !Number.isInteger(days) || days < 0 || days > leaveDeduct.workingDays)) {
        setError(`Hari dipotong dari saldo harus 0–${leaveDeduct.workingDays}`);
        return;
      }
      if (overtimeLines && overtimeLines.some((line) => !overtimeAmounts[line.itemId] || overtimeAmounts[line.itemId]! <= 0)) {
        setError("Isi nominal semua sesi overtime");
        return;
      }
      const result = await approveAction({
        requestId,
        note,
        approvedAmount: requestedAmount !== null ? approvedAmount : null,
        deductDays: leaveDeduct ? days : null,
        overtimeAmounts: overtimeLines ? (overtimeAmounts as Record<string, number>) : null,
      });
      if (result.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setNote("");
          setApprovedAmount(requestedAmount);
          setDeductDays(String(leaveDeduct?.days ?? ""));
          setOvertimeAmounts(initialOvertime());
          setError(null);
        }
      }}
    >
      <DialogTrigger render={<Button size="sm" className="bg-foreground text-background hover:bg-foreground/90" />}>
        <Check aria-hidden /> Setujui
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Setujui {label}?</DialogTitle>
          <DialogDescription>Pengajuan diteruskan ke approver berikutnya, atau disetujui final jika ini level terakhir.</DialogDescription>
        </DialogHeader>
        <FormAlert message={error} />
        {requestedAmount !== null && (
          <FormField
            label="Nominal disetujui"
            htmlFor={`amount-${requestId}`}
            hint={`Diajukan ${formatRupiah(requestedAmount)}. Boleh lebih kecil, tidak boleh lebih besar.`}
          >
            <RupiahInput id={`amount-${requestId}`} value={approvedAmount} onChange={setApprovedAmount} />
          </FormField>
        )}
        {leaveDeduct && (
          <FormField
            label="Hari dipotong dari saldo cuti"
            htmlFor={`deduct-${requestId}`}
            hint={`Dari ${leaveDeduct.workingDays} hari kerja. Terisi sesuai aturan: cuti tahunan semua, cuti kematian 0, cuti melahirkan hanya yang melewati jatah (laki-laki 2 hari kerja, perempuan 90 hari kerja). Saldo dipotong saat disetujui final.`}
          >
            <Input
              id={`deduct-${requestId}`}
              type="number"
              inputMode="numeric"
              min={0}
              max={leaveDeduct.workingDays}
              step={1}
              value={deductDays}
              onChange={(event) => setDeductDays(event.target.value)}
              className="max-w-32"
            />
          </FormField>
        )}
        {overtimeLines && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-[13px] font-bold text-ink-2">
              Nominal overtime <span className="text-red-ink">*</span>
            </legend>
            {overtimeLines.map((line) => (
              <FormField key={line.itemId} label={line.label} htmlFor={`ot-${line.itemId}`}>
                <RupiahInput
                  id={`ot-${line.itemId}`}
                  value={overtimeAmounts[line.itemId] ?? null}
                  onChange={(value) => setOvertimeAmounts((current) => ({ ...current, [line.itemId]: value }))}
                />
              </FormField>
            ))}
            <p className="text-sm text-muted-foreground">
              Total overtime{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {formatRupiah(overtimeLines.reduce((sum, line) => sum + (overtimeAmounts[line.itemId] ?? 0), 0))}
              </span>
            </p>
          </fieldset>
        )}
        <FormField label="Catatan (opsional)" htmlFor={`note-${requestId}`}>
          <Textarea id={`note-${requestId}`} value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} />
        </FormField>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Batal</DialogClose>
          <Button onClick={confirm} disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            Setujui
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
