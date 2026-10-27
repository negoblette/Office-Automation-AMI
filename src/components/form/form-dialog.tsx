"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { type FieldValues, FormProvider, type Resolver, useForm } from "react-hook-form";
import type { z } from "zod";
import { useFeedback } from "@/components/shared/feedback";
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
import { FormAlert } from "./form-actions";
import { useActionSubmit } from "./use-action-submit";

/**
 * Dialog berisi form react-hook-form + schema Zod + Server Action: reset ke `defaults` saat
 * dibuka, error server per field, tutup & refresh saat sukses. Isi field sebagai `children`.
 * Audit UI 2026-10-27: sukses → notifikasi singkat; menutup form yang sudah diubah (Esc, klik
 * di luar, tombol Batal/×) → tanya dulu di dalam dialog supaya isian tidak hilang tanpa sengaja.
 */
export function FormDialog<TSchema extends z.ZodType<FieldValues, FieldValues>, TData = undefined>({
  trigger,
  title,
  description,
  schema,
  defaults,
  submitLabel,
  successMessage = "Tersimpan",
  action,
  children,
  wide,
  onSuccess,
}: {
  trigger: React.ReactElement;
  title: string;
  description?: string;
  schema: TSchema;
  defaults: z.input<TSchema>;
  submitLabel: string;
  /** Teks notifikasi setelah berhasil; `null` = tanpa notifikasi. */
  successMessage?: string | null;
  action: (values: z.output<TSchema>) => Promise<ActionResult<TData>>;
  children: React.ReactNode;
  wide?: boolean;
  /** Dipanggil setelah sukses (sebelum refresh), mis. memilih data yang baru dibuat di form induk. */
  onSuccess?: (data: TData) => void;
}) {
  const router = useRouter();
  const { notify } = useFeedback();
  const [open, setOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const discardId = useId();
  const form = useForm<z.input<TSchema>, unknown, z.output<TSchema>>({
    resolver: zodResolver(schema) as unknown as Resolver<z.input<TSchema>, unknown, z.output<TSchema>>,
    defaultValues: defaults as never,
  });
  // Dibaca saat render supaya react-hook-form menghitung `isDirty`.
  const { isDirty } = form.formState;
  const { serverError, pending, submit } = useActionSubmit(form);

  useEffect(() => {
    if (confirmDiscard) keepEditingRef.current?.focus();
  }, [confirmDiscard]);

  const close = () => {
    setConfirmDiscard(false);
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          form.reset(defaults as never);
          setConfirmDiscard(false);
          setOpen(true);
          return;
        }
        // Esc saat pertanyaan tampil = kembali mengisi.
        if (confirmDiscard) return setConfirmDiscard(false);
        if (isDirty && !pending) return setConfirmDiscard(true);
        close();
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className={wide ? "sm:max-w-2xl" : undefined}>
        <FormProvider {...form}>
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              // Dialog di-portal, tapi event React tetap naik ke <form> induk (mis. form reimburse).
              event.stopPropagation();
              return form.handleSubmit((values) =>
                submit(
                  () => action(values),
                  (data) => {
                    close();
                    if (successMessage) notify(successMessage);
                    onSuccess?.(data);
                    router.refresh();
                  },
                ),
              )(event);
            }}
          >
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              {description && <DialogDescription>{description}</DialogDescription>}
            </DialogHeader>
            <FormAlert message={serverError} />
            {children}
            {confirmDiscard ? (
              <div
                role="group"
                aria-labelledby={discardId}
                className="flex flex-col gap-3 rounded-2xl bg-warning-soft p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <p id={discardId} className="text-sm font-semibold text-ink">
                  Perubahan belum disimpan. Tutup tanpa menyimpan?
                </p>
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <Button ref={keepEditingRef} type="button" variant="outline" onClick={() => setConfirmDiscard(false)}>
                    Lanjut mengisi
                  </Button>
                  <Button type="button" variant="destructive" onClick={close}>
                    Buang perubahan
                  </Button>
                </div>
              </div>
            ) : (
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" />}>Batal</DialogClose>
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="animate-spin" aria-hidden />}
                  {submitLabel}
                </Button>
              </DialogFooter>
            )}
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
