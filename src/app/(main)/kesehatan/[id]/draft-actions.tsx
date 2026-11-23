"use client";

import { Loader2, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { FormAlert } from "@/components/form/form-actions";
import { useFeedback } from "@/components/shared/feedback";
import { Button } from "@/components/ui/button";
import { deleteHealthClaimDraftAction, submitHealthClaimDraftAction } from "../actions";

/**
 * Aksi pemohon di detail klaim (2026-11-23, sama dengan reimburse). Draft: Ubah / Hapus / Ajukan. Ditolak: Revisi /
 * Ajukan Ulang. `edit` = tombol dialog Ubah / Lanjutkan Mengisi / Revisi (null bila plafon tahun ini belum diatur).
 */
export function HealthDraftActions({
  claimId,
  rejected = false,
  incomplete = false,
  edit,
}: {
  claimId: string;
  rejected?: boolean;
  /** Draft belum lengkap: belum bisa diajukan. */
  incomplete?: boolean;
  edit: ReactNode;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { confirm, notify } = useFeedback();

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        {edit}
        {!rejected && (
          <Button
            variant="destructive"
            size="lg"
            disabled={pending}
            onClick={async () => {
              const ok = await confirm({ title: "Hapus draft klaim ini?", description: "Draft yang dihapus tidak tampil lagi di daftar.", confirmLabel: "Hapus", tone: "danger" });
              if (!ok) return;
              setError(null);
              startTransition(async () => {
                const result = await deleteHealthClaimDraftAction(claimId);
                if (result.ok) {
                  notify("Draft klaim dihapus");
                  router.push("/kesehatan");
                } else setError(result.error);
              });
            }}
          >
            <Trash2 aria-hidden /> Hapus
          </Button>
        )}
        {!incomplete && (
          <Button
            size="lg"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await submitHealthClaimDraftAction(claimId);
                if (result.ok) {
                  notify(rejected ? "Klaim diajukan ulang" : "Klaim diajukan");
                  router.refresh();
                } else setError(result.error);
              });
            }}
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />} {rejected ? "Ajukan Ulang" : "Ajukan"}
          </Button>
        )}
      </div>
      <FormAlert message={error} />
    </div>
  );
}
