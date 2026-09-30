"use client";

import { CloudUpload, Loader2, X } from "lucide-react";
import { useId, useRef, useState, useTransition } from "react";
import { uploadFileAction } from "@/app/(main)/upload-actions";
import { FileChip } from "@/components/shared/file-chip";
import { Button } from "@/components/ui/button";
import type { StoredFile } from "@/lib/storage";
import { MAX_UPLOAD_MB, MIME_TYPES } from "@/lib/storage/validate";
import { cn } from "@/lib/utils";

const ACCEPTED_TYPES = Object.values(MIME_TYPES);

type FileUploadProps = {
  id?: string;
  value: StoredFile | null | undefined;
  onChange: (file: StoredFile | null) => void;
  disabled?: boolean;
  /** Tampilan kecil untuk dalam tabel (mis. kwitansi per baris). */
  compact?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  className?: string;
};

/**
 * Pilih/seret file → langsung di-upload (satu file per request) → nilai berupa
 * `StoredFile` { key, fileName, mimeType, sizeBytes } untuk disimpan form modul.
 * Cek jenis & ukuran di client hanya untuk respons cepat; server tetap memvalidasi isi file.
 */
export function FileUpload({ id, value, onChange, disabled, compact, className, ...aria }: FileUploadProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [isPending, startTransition] = useTransition();

  function upload(file: File) {
    setError(null);
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("File harus berupa PDF, JPG, atau PNG");
      return;
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setError(`Ukuran file maksimal ${MAX_UPLOAD_MB} MB`);
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    startTransition(async () => {
      const result = await uploadFileAction(formData);
      if (result.ok) onChange(result.file);
      else setError(result.error);
    });
  }

  if (value) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <FileChip fileKey={value.key} fileName={value.fileName} className="min-w-0" />
        {!disabled && (
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => onChange(null)} aria-label="Hapus file">
            <X />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file && !disabled && !isPending) upload(file);
        }}
        className={cn(
          "flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-primary/30 bg-info-soft/60 text-center transition-colors hover:bg-info-soft",
          compact ? "gap-2 px-3 py-2 text-sm" : "flex-col gap-2 px-4 py-8",
          dragging && "border-primary bg-info-soft",
          (disabled || isPending) && "pointer-events-none opacity-60",
        )}
      >
        {isPending ? (
          <Loader2 className={cn("animate-spin text-primary", compact ? "size-4" : "size-7")} aria-hidden />
        ) : (
          <CloudUpload className={cn("text-primary", compact ? "size-4" : "size-7")} aria-hidden />
        )}
        <span className="font-medium text-foreground">{isPending ? "Mengunggah…" : compact ? "Unggah file" : "Klik atau seret file ke sini"}</span>
        {!compact && <span className="text-xs text-muted-foreground">PDF, JPG, atau PNG · maks {MAX_UPLOAD_MB} MB</span>}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        className="sr-only"
        disabled={disabled || isPending}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) upload(file);
          event.target.value = "";
        }}
        {...aria}
      />
      {error && (
        <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
