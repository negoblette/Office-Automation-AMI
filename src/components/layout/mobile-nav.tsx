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
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-11 rounded-[14px] text-ink-2 hover:bg-ink/[0.06] hover:text-ink lg:hidden"
            aria-label="Buka menu"
          />
        }
      >
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="w-[280px] gap-0 bg-sidebar p-0 shadow-(--elev-drawer) data-[side=left]:border-r-0 sm:max-w-[280px]"
      >
        <div className="flex shrink-0 items-center justify-between pt-[22px] pr-3 pb-3 pl-4">
          <SheetTitle render={<div />}>
            <AppBrand className="pb-0" />
          </SheetTitle>
          <SheetClose render={<Button variant="ghost" size="icon-sm" className="size-10 rounded-[14px] text-ink-2 hover:bg-ink/[0.06]" aria-label="Tutup menu" />}>
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
