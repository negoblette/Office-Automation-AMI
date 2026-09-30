import Link from "next/link";
import { cn } from "@/lib/utils";

export type LinkTab = { key: string; label: string; href: string; count?: number };

/** Tab berbasis link (server-rendered), mis. Aktif/Arsip atau tab detail `?tab=`. */
export function LinkTabs({ tabs, active, label, className }: { tabs: LinkTab[]; active: string; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn("flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl bg-card p-1 shadow-card", className)}>
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            scroll={false}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors",
              isActive ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-semibold",
                  isActive ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
                )}
              >
                {tab.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
