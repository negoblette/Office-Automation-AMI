"use client";

import Link from "next/link";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Bell, CircleAlert, FileWarning, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { NotificationItem } from "@/lib/services/notifications";
import { cn } from "@/lib/utils";

const ICON = { expiry: FileWarning, approval: Inbox, rejected: CircleAlert } as const;
const TILE: Record<NotificationItem["tone"], string> = {
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  info: "bg-brand-soft text-brand-deep",
};

/** Ikon lonceng di topbar (2026-10-13): jumlah notifikasi + daftar dengan tautan langsung. */
export function NotificationBell({ items }: { items: NotificationItem[] }) {
  const count = items.length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className="relative" aria-label={count ? `Notifikasi (${count})` : "Notifikasi"} title="Notifikasi" />}
      >
        <Bell className="size-5" aria-hidden />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] leading-5 font-bold text-white tabular-nums">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-[min(22rem,calc(100vw-2rem))] rounded-[20px] p-1.5 shadow-(--elev-menu) ring-0">
        <p className="px-2.5 pt-1.5 pb-2 text-sm font-bold text-ink">Notifikasi</p>
        {count === 0 ? (
          <p className="px-2.5 pb-3 text-sm text-ink-3">Tidak ada notifikasi. Semua dokumen masih berlaku dan tidak ada yang perlu ditindaklanjuti.</p>
        ) : (
          <div className="max-h-[70vh] overflow-y-auto">
            {items.map((item) => {
              const Icon = ICON[item.kind];
              return (
                <MenuPrimitive.LinkItem
                  key={item.key}
                  closeOnClick
                  render={<Link href={item.href} />}
                  className="flex cursor-pointer items-start gap-3 rounded-[14px] px-2.5 py-2 outline-hidden transition-colors duration-300 select-none data-highlighted:bg-panel"
                >
                  <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl", TILE[item.tone])} aria-hidden>
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{item.title}</span>
                    <span className="block truncate text-xs text-ink-3">{item.detail}</span>
                  </span>
                </MenuPrimitive.LinkItem>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
