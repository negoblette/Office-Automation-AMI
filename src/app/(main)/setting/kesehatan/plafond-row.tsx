"use client";

import { Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setHealthPlafondAction } from "@/app/(main)/kesehatan/actions";
import { RupiahInput } from "@/components/form/rupiah-input";
import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/lib/format";

/** Input plafon tahunan satu karyawan (plafon hanya per tahun). */
export function PlafondInput({ employeeId, year, annual, used }: { employeeId: string; year: number; annual: number | null; used: number }) {
  const router = useRouter();
  const [value, setValue] = useState<number | null>(annual);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const dirty = value !== annual;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await setHealthPlafondAction({ employeeId, year, annualAmount: value });
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(result.fieldErrors?.annualAmount ?? result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <RupiahInput
          aria-label="Plafon tahunan"
          value={value}
          onChange={(next) => {
            setValue(next);
            setSaved(false);
          }}
          className="w-44"
        />
        <Button size="sm" onClick={save} disabled={!dirty || !value || pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : saved ? <Check aria-hidden /> : null}
          Simpan
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {value ? `Sisa ${formatRupiah(Math.max(0, value - used))} dari ${formatRupiah(value)} per tahun` : "Belum diatur"}
        {used > 0 && ` · terpakai ${formatRupiah(used)}`}
      </p>
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}
