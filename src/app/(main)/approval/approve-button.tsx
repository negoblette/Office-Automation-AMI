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
 */
export function ApproveButton({
  requestId,
  label,
  requestedAmount = null,
  leaveDeduct = null,
}: {
  requestId: string;
  label: string;
  requestedAmount?: number | null;
  /** Cuti: hari dipotong dari saldo saat ini & jumlah hari kerja; null = bukan cuti. */
  leaveDeduct?: { days: number; workingDays: number } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [approvedAmount, setApprovedAmount] = useState<number | null>(requestedAmount);
  const [deductDays, setDeductDays] = useState(String(leaveDeduct?.days ?? ""));
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
      const result = await approveAction({
        requestId,
        note,
        approvedAmount: requestedAmount !== null ? approvedAmount : null,
        deductDays: leaveDeduct ? days : null,
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
