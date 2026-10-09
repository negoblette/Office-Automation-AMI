import Link from "next/link";
import { cn } from "@/lib/utils";

export type LinkTab = { key: string; label: string; href: string; count?: number };

/**
 * Tab berbasis link (server-rendered), mis. Aktif/Arsip atau tab detail `?tab=`.
 * Gaya `.seg`: pita lembut, tab aktif putih seperti menu aktif di sidebar.
 */
export function LinkTabs({ tabs, active, label, className }: { tabs: LinkTab[]; active: string; label: string; className?: string }) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-[16px] bg-panel p-1 shadow-[inset_0_0_0_1px_rgb(var(--shade)/0.05)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            scroll={false}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex min-h-[38px] shrink-0 items-center gap-2 rounded-[12px] px-3.5 text-sm whitespace-nowrap transition-[background-color,color,box-shadow] duration-300 ease-smooth outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink focus-visible:outline-solid",
              isActive ? "bg-white font-bold text-ink shadow-(--elev-seg)" : "font-semibold text-ink-3 hover:text-ink",
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  "grid h-5 min-w-[22px] place-items-center rounded-[10px] px-1.5 text-xs font-bold tabular-nums",
                  isActive ? "bg-ink text-white" : "bg-ink/[0.08] text-ink-3",
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
