"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { type AppRole, type NavItem, getActiveChildHref, getNavForRole, isPathActive } from "./nav-config";

/** Angka badge per href menu, mis. { "/approval": 3 }. */
export type NavBadges = Record<string, number>;

type SidebarNavProps = {
  role: AppRole;
  badges?: NavBadges;
  /** Dipanggil setelah klik link (menutup drawer di HP). */
  onNavigate?: () => void;
};

const itemBaseClass =
  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring";
const itemIdleClass = "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";
const itemActiveClass = "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm";

export function SidebarNav({ role, badges, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const groups = getNavForRole(role);

  return (
    <nav aria-label="Menu utama" className="flex flex-col gap-5 px-3 py-4">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            {group.label}
          </p>
          {group.items.map((item) => (
            <SidebarItem key={item.href} item={item} badge={badges?.[item.href]} pathname={pathname} onNavigate={onNavigate} />
          ))}
        </div>
      ))}

      {role === "ADMIN" && (
        <div
          aria-disabled="true"
          className={cn(itemBaseClass, "cursor-not-allowed text-muted-foreground/80")}
          title="Modul laporan menyusul"
        >
          <BarChart3 className="size-4.5 shrink-0" aria-hidden />
          <span className="flex-1">Laporan</span>
          <span className="text-[11px] font-medium">Menyusul</span>
        </div>
      )}
    </nav>
  );
}

function SidebarItem({
  item,
  badge,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  badge?: number;
  pathname: string;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const isActive = isPathActive(pathname, item.href);
  // null = ikuti route aktif; true/false = dibuka/ditutup manual.
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);

  if (!item.children) {
    return (
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={isActive ? "page" : undefined}
        className={cn(itemBaseClass, isActive ? itemActiveClass : itemIdleClass)}
      >
        <Icon className="size-4.5 shrink-0" aria-hidden />
        <span className="flex-1 truncate">{item.label}</span>
        {badge ? (
          <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger" aria-label={`${badge} menunggu`}>
            {badge} Pending
          </span>
        ) : null}
      </Link>
    );
  }

  const isOpen = manualOpen ?? isActive;
  const activeChildHref = getActiveChildHref(pathname, item.children);
  const submenuId = `submenu-${item.href.replaceAll("/", "-")}`;

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={submenuId}
        onClick={() => setManualOpen(!isOpen)}
        className={cn(itemBaseClass, isActive ? itemActiveClass : itemIdleClass)}
      >
        <Icon className="size-4.5 shrink-0" aria-hidden />
        <span className="flex-1 truncate text-left">{item.label}</span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", isOpen && "rotate-180")} aria-hidden />
      </button>
      {isOpen && (
        <ul id={submenuId} className="ml-5 flex flex-col gap-0.5 border-l border-sidebar-border pl-3">
          {item.children.map((child) => {
            const isChildActive = child.href === activeChildHref;
            return (
              <li key={child.href}>
                <Link
                  href={child.href}
                  onClick={onNavigate}
                  aria-current={isChildActive ? "page" : undefined}
                  className={cn(
                    "block rounded-md px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                    isChildActive
                      ? "bg-accent font-semibold text-primary"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  {child.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
