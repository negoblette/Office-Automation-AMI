"use client";

import Link from "next/link";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { ChevronDown, HeartPulse, CalendarDays, Plus, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const REQUEST_LINKS = [
  { label: "Reimburse", href: "/reimburse/baru", icon: ReceiptText },
  { label: "Cuti", href: "/cuti", icon: CalendarDays },
  { label: "Klaim Kesehatan", href: "/kesehatan", icon: HeartPulse },
] as const;

/** Warna kotak ikon per jenis pengajuan (hanya tampilan). */
const TILE_CLASSES: Record<(typeof REQUEST_LINKS)[number]["href"], string> = {
  "/reimburse/baru": "bg-brand-soft text-brand-deep",
  "/cuti": "bg-amber-soft text-amber-deep",
  "/kesehatan": "bg-green-soft text-green-deep",
};

/** Tombol biru "+ Ajukan" di topbar dengan pilihan jenis pengajuan. */
export function SubmitRequestMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size="lg"
            className="h-11 gap-2 rounded-full bg-brand pr-4 pl-3.5 font-bold text-white shadow-(--elev-cta) transition-[filter,transform] duration-500 ease-smooth hover:bg-brand hover:brightness-[1.07] active:scale-[0.97] motion-reduce:transition-none"
          />
        }
      >
        <Plus className="size-4.5" aria-hidden />
        <span>Ajukan</span>
        <ChevronDown className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64 rounded-[20px] p-1.5 shadow-(--elev-menu) ring-0">
        {REQUEST_LINKS.map(({ label, href, icon: Icon }, index) => (
          <MenuPrimitive.LinkItem
            key={href}
            closeOnClick
            render={<Link href={href} />}
            style={{ animationDelay: `${index * 45 + 40}ms` }}
            className="flex min-h-14 cursor-pointer items-center gap-3 rounded-[14px] px-2.5 text-sm font-bold text-ink outline-hidden transition-colors duration-300 select-none data-highlighted:bg-panel motion-safe:animate-[oa-rise_0.4s_var(--ease)_both]"
          >
            <span className={cn("flex size-[38px] shrink-0 items-center justify-center rounded-xl", TILE_CLASSES[href])} aria-hidden>
              <Icon className="size-4.5" />
            </span>
            {label}
          </MenuPrimitive.LinkItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
