import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: string;
  description?: React.ReactNode;
  /** Ikon hanya digambar pada tampilan `card` (versi tenang tanpa gambar). */
  icon?: LucideIcon;
  /** Tombol/link aksi di bawah teks. */
  action?: React.ReactNode;
  /** `plain` = versi tenang, teks saja (default); `card` = tampilan lama, khusus Dashboard. */
  look?: "plain" | "card";
  className?: string;
};

export function EmptyState({ title, description, icon: Icon = Inbox, action, look = "plain", className }: EmptyStateProps) {
  if (look === "card") {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-2xl bg-card px-6 py-14 text-center shadow-card",
          className,
        )}
      >
        <div className="flex size-12 items-center justify-center rounded-xl bg-info-soft text-primary">
          <Icon className="size-6" aria-hidden />
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold text-foreground">{title}</p>
          {description && <p className="mx-auto max-w-md text-sm text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="mt-1">{action}</div>}
      </div>
    );
  }
  return (
    <div className={cn("flex flex-col items-center gap-1 px-4 pt-10 pb-9 text-center", className)}>
      <p className="text-base font-bold text-ink">{title}</p>
      {description && <p className="max-w-[46ch] text-sm text-ink-3">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
