"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addDocumentAction, deleteDocumentAction } from "@/app/(main)/dokumen-actions";
import { FileUpload } from "@/components/form/file-upload";
import { FileChip } from "@/components/shared/file-chip";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import type { DocumentType } from "@/generated/prisma/enums";
import type { ActionResult } from "@/lib/actions";
import type { DocumentView } from "@/lib/services/employee-queries";
import { cn } from "@/lib/utils";

type DocumentSlotProps = {
  label: string;
  required?: boolean;
  documents: DocumentView[];
  canEdit: boolean;
  target: { employeeId: string; docType: DocumentType; familyMemberId?: string };
  /** Ganti aksi default (dokumen karyawan), mis. untuk dokumen kandidat. */
  onAdd?: (file: { key: string; fileName: string }) => Promise<ActionResult>;
  onDelete?: (documentId: string) => Promise<ActionResult>;
  className?: string;
};

/** Satu jenis dokumen: status, file yang sudah ada (lihat/hapus), dan upload tambahan. */
export function DocumentSlot({ label, required = true, documents, canEdit, target, onAdd, onDelete, className }: DocumentSlotProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  const filled = documents.length > 0;
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border border-border bg-background p-4", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold">{label}</p>
        {filled ? (
          <StatusBadge variant="success">Ada</StatusBadge>
        ) : (
          <StatusBadge variant={required ? "danger" : "neutral"}>{required ? "Belum ada" : "Opsional"}</StatusBadge>
        )}
      </div>

      {documents.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center gap-1">
              <FileChip fileKey={doc.fileKey} fileName={doc.fileName} className="min-w-0 flex-1" />
              {canEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={pending}
                  aria-label={`Hapus ${doc.fileName}`}
                  onClick={() => {
                    if (window.confirm(`Hapus file "${doc.fileName}"?`)) run(() => (onDelete ?? deleteDocumentAction)(doc.id));
                  }}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit &&
        (pending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Menyimpan…
          </p>
        ) : (
          <FileUpload
            compact
            value={null}
            onChange={(file) => {
              if (file)
                run(() =>
                  onAdd ? onAdd({ key: file.key, fileName: file.fileName }) : addDocumentAction({ ...target, fileKey: file.key, fileName: file.fileName }),
                );
            }}
          />
        ))}
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
