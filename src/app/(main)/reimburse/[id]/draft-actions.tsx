"use client";

import { Loader2, Pencil, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormAlert } from "@/components/form/form-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { deleteReimbursementAction, submitReimbursementAction } from "../actions";

/** Aksi pemohon untuk draft: Edit, Hapus, Ajukan. */
/** Draft: Edit / Hapus / Ajukan. Ditolak (2026-10-12): Revisi / Ajukan Ulang. */
export function DraftActions({ reimbursementId, rejected = false }: { reimbursementId: string; rejected?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        <Link href={`/reimburse/${reimbursementId}/edit`} className={buttonVariants({ variant: "outline", size: "lg" })}>
          <Pencil aria-hidden /> {rejected ? "Revisi" : "Edit"}
        </Link>
        {!rejected && (
          <Button
            variant="destructive"
            size="lg"
            disabled={pending}
            onClick={() => {
              if (!window.confirm("Hapus draft reimburse ini?")) return;
              startTransition(async () => {
                const result = await deleteReimbursementAction(reimbursementId);
                if (result.ok) router.push("/reimburse");
                else setError(result.error);
              });
            }}
          >
            <Trash2 aria-hidden /> Hapus
          </Button>
        )}
        <Button
          size="lg"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await submitReimbursementAction(reimbursementId);
              if (result.ok) router.refresh();
              else setError(result.error);
            });
          }}
        >
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />} {rejected ? "Ajukan Ulang" : "Ajukan"}
        </Button>
      </div>
      <FormAlert message={error} />
    </div>
  );
}
