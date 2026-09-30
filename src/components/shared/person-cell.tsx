import { cn } from "@/lib/utils";

/** Inisial maksimal 2 huruf dari nama, mis. "Andi Wijaya" → "AW". */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

type PersonAvatarProps = {
  name: string;
  /** URL foto (mis. `/api/files/[id]`). Tanpa foto → inisial. */
  imageUrl?: string | null;
  size?: "sm" | "md";
  className?: string;
};

export function PersonAvatar({ name, imageUrl, size = "md", className }: PersonAvatarProps) {
  const sizeClass = size === "sm" ? "size-8 text-xs" : "size-10 text-sm";
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- file dilayani /api/files dengan cek akses
      <img src={imageUrl} alt={name} className={cn("shrink-0 rounded-full object-cover", sizeClass, className)} />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-info-soft font-semibold text-primary",
        sizeClass,
        className,
      )}
    >
      {getInitials(name)}
    </span>
  );
}

type PersonCellProps = {
  name: string;
  /** Sub-teks: jabatan / NIK / email. */
  subtitle?: React.ReactNode;
  imageUrl?: string | null;
  className?: string;
};

/** Avatar + nama tebal + sub-teks, untuk kolom pemohon/karyawan. */
export function PersonCell({ name, subtitle, imageUrl, className }: PersonCellProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <PersonAvatar name={name} imageUrl={imageUrl} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{name}</p>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}
