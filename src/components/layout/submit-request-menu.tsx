"use client";

import Link from "next/link";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { ChevronDown, HeartPulse, CalendarDays, Plus, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const REQUEST_LINKS = [
  { label: "Reimburse", href: "/reimburse/baru", icon: ReceiptText },
  { label: "Cuti", href: "/cuti", icon: CalendarDays },
  { label: "Klaim Kesehatan", href: "/kesehatan", icon: HeartPulse },
] as const;

/** Tombol biru "+ Ajukan" di topbar dengan pilihan jenis pengajuan. */
export function SubmitRequestMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="lg" className="gap-1.5 px-3 font-semibold shadow-sm" />}>
        <Plus className="size-4" aria-hidden />
        <span>Ajukan</span>
        <ChevronDown className="size-3.5 opacity-80" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 p-1.5">
        {REQUEST_LINKS.map(({ label, href, icon: Icon }) => (
          <MenuPrimitive.LinkItem
            key={href}
            closeOnClick
            render={<Link href={href} />}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
          >
            <Icon className="size-4 text-primary" aria-hidden />
            {label}
          </MenuPrimitive.LinkItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
