"use client";

import { Loader2, PencilLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormAlert } from "@/components/form/form-actions";
import { RupiahInput } from "@/components/form/rupiah-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { CorrectionTarget, CorrectionView } from "@/lib/services/approval-correction";
import { correctRequestAction, getCorrectionTargetsAction } from "./actions";

/** Tombol "Koreksi" — approver step aktif mengoreksi nominal & keterangan sebelum menyetujui. */
export function CorrectionButton({ requestId, label }: { requestId: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<CorrectionTarget[] | null>(null);
  const [draft, setDraft] = useState<Record<string, { amount: number | null; text: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function load() {
    setError(null);
    setTargets(null);
    startTransition(async () => {
      const result = await getCorrectionTargetsAction(requestId);
      if (!result.ok) return setError(result.error);
      setTargets(result.data);
      setDraft(Object.fromEntries(result.data.map((t) => [t.targetId, { amount: t.amount, text: t.text }])));
    });
  }

  function save() {
    if (!targets) return;
    setError(null);
    const changes = targets.map((t) => ({ targetId: t.targetId, amount: t.amount === null ? null : draft[t.targetId].amount, text: draft[t.targetId].text }));
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
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Koreksi {label}</DialogTitle>
          <DialogDescription>Ubah nominal / keterangan yang salah sebelum menyetujui. Setiap perubahan dicatat dan terlihat oleh pemohon.</DialogDescription>
        </DialogHeader>
        <FormAlert message={error} />
        {!targets ? (
          pending && <Loader2 className="mx-auto animate-spin text-muted-foreground" aria-hidden />
        ) : (
          <ul className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
            {targets.map((t) => (
              <li key={t.targetId} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1fr_180px]">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {t.label} · {t.textLabel}
                  </span>
                  <Input value={draft[t.targetId]?.text ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [t.targetId]: { ...d[t.targetId], text: e.target.value } }))} />
                </label>
                {t.amount !== null && (
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-xs font-semibold text-muted-foreground">Nominal</span>
                    <RupiahInput value={draft[t.targetId]?.amount ?? null} onChange={(amount) => setDraft((d) => ({ ...d, [t.targetId]: { ...d[t.targetId], amount } }))} />
                  </label>
                )}
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

/** Daftar koreksi approver (sebelum → sesudah). */
export function CorrectionList({ corrections, className }: { corrections: CorrectionView[]; className?: string }) {
  if (corrections.length === 0) return null;
  return (
    <ul className={className ?? "flex flex-col gap-1 text-xs text-muted-foreground"}>
      {corrections.map((c) => (
        <li key={c.id}>
          <span className="font-medium text-foreground">Dikoreksi {c.editedBy}</span> · {c.label}:{" "}
          <span className="line-through">{c.before || "—"}</span> → <span className="font-medium text-warning">{c.after}</span>
        </li>
      ))}
    </ul>
  );
}
