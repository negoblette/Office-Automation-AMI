"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import shell from "./app-shell.module.css";
import { type AppRole, type NavItem, getActiveChildHref, getNavForRole, isPathActive } from "./nav-config";

/** Angka badge per href menu, mis. { "/approval": 3 }. */
export type NavBadges = Record<string, number>;

type SidebarNavProps = {
  role: AppRole;
  badges?: NavBadges;
  /** Dipanggil setelah klik link (menutup drawer di HP). */
  onNavigate?: () => void;
};

const motionClass = "transition-[background-color,color,box-shadow] duration-[350ms] ease-smooth motion-reduce:transition-none";
const itemBaseClass = cn(
  "flex min-h-11 w-full items-center gap-3 rounded-[14px] px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
  motionClass,
);
const itemIdleClass = "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";
/** Item aktif: pil putih berbayang, ikon biru. */
const itemActiveClass = "bg-sidebar-primary font-bold text-sidebar-primary-foreground shadow-(--elev-pill) [&>svg:first-child]:text-brand";
/** Induk submenu yang route-nya aktif: tebal + ikon biru (pil putih ada di sub-menu aktif). */
const parentActiveClass = "font-bold text-ink hover:bg-sidebar-accent [&>svg:first-child]:text-brand";

export function SidebarNav({ role, badges, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const groups = getNavForRole(role);

  return (
    <nav aria-label="Menu utama" className="flex flex-col pt-1 pr-1 pb-7 pl-4">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          <p className="px-3 pt-3.5 pb-1.5 text-xs font-bold text-mute">{group.label}</p>
          {group.items.map((item) => (
            <SidebarItem key={item.href} item={item} badge={badges?.[item.href]} pathname={pathname} onNavigate={onNavigate} />
          ))}
        </div>
      ))}

      {role === "ADMIN" && (
        <div aria-disabled="true" className="mt-3.5 flex min-h-11 cursor-not-allowed items-center gap-3 px-3 text-sm font-medium text-mute" title="Modul laporan menyusul">
          <BarChart3 className="size-4.5 shrink-0" strokeWidth={1.75} aria-hidden />
          <span className="flex-1">Laporan</span>
          <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold shadow-[inset_0_0_0_1px_var(--rule)]">Menyusul</span>
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
        <Icon className="size-4.5 shrink-0" strokeWidth={1.75} aria-hidden />
        <span className="flex-1 truncate">{item.label}</span>
        {badge ? (
          <span className="grid h-[22px] min-w-[22px] place-items-center rounded-full bg-brand px-1.5 text-xs font-bold text-white" aria-label={`${badge} menunggu`}>
            {badge}
          </span>
        ) : null}
      </Link>
    );
  }

  const isOpen = manualOpen ?? isActive;
  const activeChildHref = getActiveChildHref(pathname, item.children);
  const submenuId = `submenu-${item.href.replaceAll("/", "-")}`;

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={submenuId}
        onClick={() => setManualOpen(!isOpen)}
        className={cn(itemBaseClass, isActive ? parentActiveClass : itemIdleClass)}
      >
        <Icon className="size-4.5 shrink-0" strokeWidth={1.75} aria-hidden />
        <span className="flex-1 truncate text-left">{item.label}</span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-mute transition-transform duration-[450ms] ease-smooth motion-reduce:transition-none", isOpen && "rotate-180")}
          aria-hidden
        />
      </button>
      {/* Tetap dirender saat tertutup (visibility: hidden) supaya buka/tutup bisa beranimasi. */}
      <div className={cn(shell.sub, isOpen && shell.subOpen)}>
        <ul id={submenuId} className={shell.subList}>
          {item.children.map((child) => {
            const isChildActive = child.href === activeChildHref;
            return (
              <li key={child.href}>
                <Link
                  href={child.href}
                  // Saat tertutup tidak di-prefetch, sama seperti dulu ketika link-nya belum dirender.
                  prefetch={isOpen ? null : false}
                  onClick={onNavigate}
                  aria-current={isChildActive ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center rounded-r-[14px] pr-3 pl-5 text-[13.5px] outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset",
                    motionClass,
                    isChildActive
                      ? "bg-sidebar-primary font-bold text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  {child.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
