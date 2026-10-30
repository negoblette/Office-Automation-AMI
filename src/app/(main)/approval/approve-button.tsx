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
import { Textarea } from "@/components/ui/textarea";
import { formatRupiah } from "@/lib/format";
import { approveAction } from "./actions";

/**
 * Tombol "Setujui" + dialog konfirmasi dengan catatan opsional. Klaim kesehatan: isian nominal disetujui.
 * Cuti (2026-10-30): centang "Potong saldo cuti", awalnya sesuai jenis cuti.
 */
export function ApproveButton({
  requestId,
  label,
  requestedAmount = null,
  deductBalance = null,
}: {
  requestId: string;
  label: string;
  requestedAmount?: number | null;
  /** Cuti: nilai potong saldo saat ini; null = bukan cuti. */
  deductBalance?: boolean | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [approvedAmount, setApprovedAmount] = useState<number | null>(requestedAmount);
  const [deduct, setDeduct] = useState(deductBalance ?? false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      if (requestedAmount !== null && (!approvedAmount || approvedAmount > requestedAmount)) {
        setError(`Nominal disetujui harus lebih dari 0 dan maksimal ${formatRupiah(requestedAmount)}`);
        return;
      }
      const result = await approveAction({
        requestId,
        note,
        approvedAmount: requestedAmount !== null ? approvedAmount : null,
        deductBalance: deductBalance !== null ? deduct : null,
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
          setDeduct(deductBalance ?? false);
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
        {deductBalance !== null && (
          <div className="flex flex-col gap-1">
            {/* Gaya sama dengan CheckboxField (min-h-11 = area sentuh ≥ 44 px). */}
            <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={deduct}
                onChange={(event) => setDeduct(event.target.checked)}
                aria-describedby={`deduct-${requestId}-hint`}
                className="size-[18px] shrink-0 cursor-pointer accent-primary"
              />
              Potong saldo cuti
            </label>
            <p id={`deduct-${requestId}-hint`} className="text-[12.5px] text-ink-3">
              Cuti tahunan biasanya dipotong; cuti melahirkan & kematian tidak. Saldo dipotong saat disetujui final.
            </p>
          </div>
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
