import { FileImage, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

type FileChipProps = {
  fileKey: string;
  fileName: string;
  className?: string;
};

/** Chip nama file yang membuka `/api/files/[key]` (hak akses dicek di server). */
export function FileChip({ fileKey, fileName, className }: FileChipProps) {
  const Icon = fileKey.endsWith(".pdf") ? FileText : FileImage;
  return (
    <a
      href={`/api/files/${fileKey}`}
      target="_blank"
      rel="noopener noreferrer"
      title={fileName}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-md bg-info-soft px-2.5 py-1 text-sm font-medium text-foreground hover:bg-info-soft/70",
        className,
      )}
    >
      <Icon className="size-4 shrink-0 text-primary" aria-hidden />
      <span className="truncate">{fileName}</span>
    </a>
  );
}
