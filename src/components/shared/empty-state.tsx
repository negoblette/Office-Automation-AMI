import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  /** Tombol/link aksi di bawah teks. */
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({ title, description, icon: Icon = Inbox, action, className }: EmptyStateProps) {
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
