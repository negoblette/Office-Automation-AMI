"use client";

import { useState, useTransition } from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import type { ActionResult } from "@/lib/actions";

/**
 * Jalankan Server Action dari form react-hook-form: status pending, pesan error umum,
 * dan error per field dari server (mis. "NIK sudah terdaftar") ditempel ke input-nya.
 */
export function useActionSubmit<TValues extends FieldValues, TContext, TOutput extends FieldValues>(
  form: UseFormReturn<TValues, TContext, TOutput>,
) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit<TData>(run: () => Promise<ActionResult<TData>>, onSuccess: (data: TData) => void) {
    setServerError(null);
    startTransition(async () => {
      const result = await run();
      if (result.ok) {
        onSuccess(result.data);
        return;
      }
      setServerError(result.error);
      for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
        form.setError(field as Path<TValues>, { message });
      }
    });
  }

  return { serverError, pending, submit };
}
