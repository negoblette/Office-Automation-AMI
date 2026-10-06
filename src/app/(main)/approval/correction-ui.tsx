"use client";

import { Loader2, PencilLine, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { z } from "zod";
import { TextareaField } from "@/components/form/fields";
import { FormAlert } from "@/components/form/form-actions";
import { FormDialog } from "@/components/form/form-dialog";
import { RupiahInput } from "@/components/form/rupiah-input";
import { SelectField } from "@/components/form/select-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toJakartaIsoDate } from "@/lib/format";
import type { CorrectionField, CorrectionTarget, CorrectionValue, CorrectionView } from "@/lib/services/approval-correction";
import { cn } from "@/lib/utils";
import { correctRequestAction, getCorrectionTargetsAction, revokeApprovalAction } from "./actions";

type Draft = Record<string, Record<string, CorrectionValue>>;
const EMPTY = "__empty__";

/**
 * Tombol "Koreksi" — approver step aktif mengoreksi isi pengajuan sebelum menyetujui (reimburse per
 * baris: tanggal, company, project, tipe, payment, nominal, lokasi, aktivitas, nama – jabatan, kwitansi).
 */
export function CorrectionButton({ requestId, label }: { requestId: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<CorrectionTarget[] | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function load() {
    setError(null);
    setTargets(null);
    startTransition(async () => {
      const result = await getCorrectionTargetsAction(requestId);
      if (!result.ok) return setError(result.error);
      setTargets(result.data);
      setDraft(Object.fromEntries(result.data.map((t) => [t.targetId, Object.fromEntries(t.fields.map((f) => [f.key, f.value]))])));
    });
  }

  function setValue(target: CorrectionTarget, key: string, value: CorrectionValue) {
    setDraft((d) => {
      const next = { ...d[target.targetId], [key]: value };
      // Field yang bergantung pada field ini (mis. project ← company) dikosongkan bila tidak cocok lagi.
      for (const dep of target.fields.filter((f) => f.dependsOn === key)) {
        const option = dep.options?.find((o) => o.value === next[dep.key]);
        if (option?.parent !== undefined && option.parent !== value) next[dep.key] = "";
      }
      return { ...d, [target.targetId]: next };
    });
  }

  function save() {
    if (!targets) return;
    setError(null);
    const changes = targets.map((t) => ({ targetId: t.targetId, values: draft[t.targetId] }));
    startTransition(async () => {
      const result = await correctRequestAction(requestId, changes);
      if (result.ok) {
        setOpen(false);
        router.refresh();
      } else setError(result.error);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) load();
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <PencilLine aria-hidden /> Koreksi
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Koreksi {label}</DialogTitle>
          <DialogDescription>Ubah isian yang salah sebelum menyetujui. Setiap perubahan dicatat (sebelum → sesudah) dan terlihat oleh pemohon.</DialogDescription>
        </DialogHeader>
        <FormAlert message={error} />
        {!targets ? (
          pending && <Loader2 className="mx-auto animate-spin text-muted-foreground" aria-hidden />
        ) : (
          <ul className="flex max-h-[65vh] flex-col gap-3 overflow-y-auto pr-1">
            {targets.map((t) => (
              <li key={t.targetId} className="rounded-xl border border-border p-3">
                <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{t.label}</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {t.fields.map((f) => (
                    <FieldInput
                      key={f.key}
                      id={`${t.targetId}-${f.key}`}
                      field={f}
                      value={draft[t.targetId]?.[f.key] ?? null}
                      parentValue={f.dependsOn ? draft[t.targetId]?.[f.dependsOn] : undefined}
                      onChange={(value) => setValue(t, f.key, value)}
                    />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Batal</DialogClose>
          <Button onClick={save} disabled={pending || !targets}>
            {pending && targets && <Loader2 className="animate-spin" aria-hidden />}
            Simpan Koreksi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldInput({
  id,
  field,
  value,
  parentValue,
  onChange,
}: {
  id: string;
  field: CorrectionField;
  value: CorrectionValue;
  parentValue: CorrectionValue | undefined;
  onChange: (value: CorrectionValue) => void;
}) {
  const wide = field.kind === "textarea" || field.key === "activity";
  let input: React.ReactNode;
  switch (field.kind) {
    case "amount":
      input = <RupiahInput id={id} value={value as number | null} onChange={onChange} />;
      break;
    case "date":
      input = <Input id={id} type="date" max={toJakartaIsoDate()} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "textarea":
      input = <Textarea id={id} rows={2} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "boolean":
      input = (
        <div role="radiogroup" aria-label={field.label} className="inline-flex w-fit rounded-lg bg-muted p-1">
          {[
            { v: true, label: "Ya" },
            { v: false, label: "Tidak" },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              role="radio"
              aria-checked={value === option.v}
              onClick={() => onChange(option.v)}
              className={cn("rounded-md px-4 py-1.5 text-sm font-medium", value === option.v ? "bg-background shadow-sm" : "text-muted-foreground")}
            >
              {option.label}
            </button>
          ))}
        </div>
      );
      break;
    case "select": {
      // Base UI Select tidak menerima value "" → dipetakan ke EMPTY.
      const options = (field.options ?? [])
        .filter((o) => o.parent === undefined || o.parent === parentValue)
        .map((o) => ({ value: o.value === "" ? EMPTY : o.value, label: o.label }));
      input = (
        <SelectField
          id={id}
          options={options}
          value={value === "" || value === null ? (field.optional ? EMPTY : null) : String(value)}
          onChange={(next) => onChange(next === EMPTY || next === null ? "" : next)}
        />
      );
      break;
    }
    default:
      input = <Input id={id} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <label htmlFor={id} className={cn("flex flex-col gap-1 text-sm", wide && "sm:col-span-2 lg:col-span-3")}>
      <span className="text-xs font-semibold text-muted-foreground">{field.label}</span>
      {input}
    </label>
  );
}

const revokeFormSchema = z.object({
  reason: z.string().trim().min(3, { error: "Alasan minimal 3 karakter" }).max(500, { error: "Alasan maksimal 500 karakter" }),
});

/**
 * "Batalkan Approval" — mengubah keputusan: persetujuan terakhir dibatalkan, step kembali menunggu
 * (bisa dikoreksi & disetujui ulang). Untuk approver yang menyetujui atau Admin.
 */
export function RevokeButton({ requestId, label, final }: { requestId: string; label: string; final: boolean }) {
  return (
    <FormDialog
      trigger={
        <Button size="sm" variant="outline">
          <Undo2 aria-hidden /> Batalkan Approval
        </Button>
      }
      title={`Batalkan approval ${label}`}
      description={
        final
          ? "Pengajuan ini sudah disetujui final. Persetujuan terakhir dibatalkan dan pengajuan kembali menunggu approval (efeknya ikut dibatalkan, mis. saldo cuti dikembalikan). Tercatat dan terlihat pemohon."
          : "Persetujuan terakhir dibatalkan; level itu kembali menunggu approval. Tercatat dan terlihat pemohon."
      }
      schema={revokeFormSchema}
      defaults={{ reason: "" }}
      submitLabel="Batalkan Approval"
      action={(values) => revokeApprovalAction({ requestId, reason: values.reason })}
    >
      <TextareaField name="reason" label="Alasan" required />
    </FormDialog>
  );
}

/** Daftar koreksi approver (sebelum → sesudah) & pembatalan approval. */
export function CorrectionList({ corrections, className }: { corrections: CorrectionView[]; className?: string }) {
  if (corrections.length === 0) return null;
  return (
    <ul className={className ?? "flex flex-col gap-1 text-xs text-muted-foreground"}>
      {corrections.map((c) => (
        <li key={c.id}>
          {c.field === "REVOKE" ? (
            <>
              <span className="font-medium text-foreground">{c.editedBy}</span> membatalkan {c.label.toLowerCase()} ({c.before}) ·{" "}
              <span className="font-medium text-danger">{c.after}</span>
            </>
          ) : (
            <>
              <span className="font-medium text-foreground">Dikoreksi {c.editedBy}</span> · {c.label}:{" "}
              <span className="line-through">{c.before || "—"}</span> → <span className="font-medium text-warning">{c.after || "—"}</span>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
