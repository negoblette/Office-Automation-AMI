"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AppBrand } from "./app-brand";
import type { AppRole } from "./nav-config";
import { type NavBadges, SidebarNav } from "./sidebar-nav";

/** Tombol hamburger + drawer menu untuk layar < lg. */
export function MobileNav({ role, badges }: { role: AppRole; badges?: NavBadges }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden" aria-label="Buka menu" />}>
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent side="left" showCloseButton={false} className="w-[280px] gap-0 bg-sidebar p-0 sm:max-w-[280px]">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-sidebar-border px-5">
          <SheetTitle render={<div />}>
            <AppBrand />
          </SheetTitle>
          <SheetClose render={<Button variant="ghost" size="icon-sm" aria-label="Tutup menu" />}>
            <X />
          </SheetClose>
        </div>
        <div className="flex-1 overflow-y-auto [scrollbar-width:thin]">
          <SidebarNav role={role} badges={badges} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
