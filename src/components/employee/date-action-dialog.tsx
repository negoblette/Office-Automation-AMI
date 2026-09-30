"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DateInput } from "@/components/form/date-input";
import { FormAlert } from "@/components/form/form-actions";
import { FormField } from "@/components/form/form-field";
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
import type { ActionResult } from "@/lib/actions";
import { toJakartaIsoDate } from "@/lib/format";

type DateActionDialogProps = {
  /** Tombol pemicu, mis. <Button>Resign</Button>. */
  trigger: React.ReactElement;
  title: string;
  description: React.ReactNode;
  dateLabel: string;
  /** Nama field untuk error server (mis. "endDate"). */
  fieldName: string;
  confirmLabel: string;
  destructive?: boolean;
  action: (isoDate: string) => Promise<ActionResult>;
};

/** Dialog konfirmasi dengan satu input tanggal (Resign / Aktifkan kembali). */
export function DateActionDialog({
  trigger,
  title,
  description,
  dateLabel,
  fieldName,
  confirmLabel,
  destructive,
  action,
}: DateActionDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(toJakartaIsoDate());
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    setFieldError(undefined);
    startTransition(async () => {
      const result = await action(date);
      if (result.ok) {
        setOpen(false);
        router.refresh();
        return;
      }
      const message = result.fieldErrors?.[fieldName];
      if (message) setFieldError(message);
      else setError(result.error);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setDate(toJakartaIsoDate());
          setError(null);
          setFieldError(undefined);
        }
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <FormAlert message={error} />
        <FormField label={dateLabel} htmlFor={`${fieldName}-dialog`} required error={fieldError}>
          <DateInput id={`${fieldName}-dialog`} value={date} onChange={(event) => setDate(event.target.value)} />
        </FormField>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Batal</DialogClose>
          <Button variant={destructive ? "destructive" : "default"} onClick={confirm} disabled={pending || !date}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
