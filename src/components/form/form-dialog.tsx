"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type FieldValues, FormProvider, type Resolver, useForm } from "react-hook-form";
import type { z } from "zod";
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
 */
export function FormDialog<TSchema extends z.ZodType<FieldValues, FieldValues>, TData = undefined>({
  trigger,
  title,
  description,
  schema,
  defaults,
  submitLabel,
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
  action: (values: z.output<TSchema>) => Promise<ActionResult<TData>>;
  children: React.ReactNode;
  wide?: boolean;
  /** Dipanggil setelah sukses (sebelum refresh), mis. memilih data yang baru dibuat di form induk. */
  onSuccess?: (data: TData) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const form = useForm<z.input<TSchema>, unknown, z.output<TSchema>>({
    resolver: zodResolver(schema) as unknown as Resolver<z.input<TSchema>, unknown, z.output<TSchema>>,
    defaultValues: defaults as never,
  });
  const { serverError, pending, submit } = useActionSubmit(form);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset(defaults as never);
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
                    setOpen(false);
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
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Batal</DialogClose>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" aria-hidden />}
                {submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

