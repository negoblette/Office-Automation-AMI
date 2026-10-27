"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { KeyRound, Loader2, LogOut, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { PersonAvatar } from "@/components/shared/person-cell";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { logoutAction } from "./actions";

const ITEM =
  "flex min-h-12 cursor-pointer items-center gap-3 rounded-[14px] px-3 text-sm font-bold text-ink outline-hidden transition-colors duration-300 select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-panel [&_svg]:size-[18px] [&_svg]:shrink-0";

/**
 * Menu akun untuk layar HP (< 640 px; audit UI 2026-10-27). Di layar sempit tombol MFA, Ganti password, dan
 * Keluar tidak muat di topbar (Keluar terpotong di layar ≤ 390 px), jadi digabung di balik avatar.
 * Keluar dipisah garis & berwarna merah supaya tidak tertekan tanpa sengaja. Layar lebar tetap memakai ikon.
 */
export function AccountMenu({ name, roleLabel, showMfa }: { name: string; roleLabel: string; showMfa: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Menu akun ${name}`}
            className="cursor-pointer rounded-[14px] transition-transform duration-200 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          />
        }
      >
        <PersonAvatar name={name} className="size-11 bg-brand-tint text-sm" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-[min(17rem,calc(100vw-2rem))] rounded-[20px] p-1.5 shadow-(--elev-menu) ring-0">
        <div className="px-3 pt-2 pb-2.5">
          <p className="truncate text-sm font-bold text-ink">{name}</p>
          <p className="text-xs text-ink-3">{roleLabel}</p>
        </div>
        <MenuPrimitive.Separator className="mx-1 my-1 h-px bg-line" />
        {showMfa && (
          <MenuPrimitive.LinkItem closeOnClick render={<Link href="/mfa" />} className={ITEM}>
            <ShieldCheck aria-hidden className="text-ink-3" /> Keamanan akun (MFA)
          </MenuPrimitive.LinkItem>
        )}
        <MenuPrimitive.LinkItem closeOnClick render={<Link href="/ganti-password" />} className={ITEM}>
          <KeyRound aria-hidden className="text-ink-3" /> Ganti password
        </MenuPrimitive.LinkItem>
        <MenuPrimitive.Separator className="mx-1 my-1 h-px bg-line" />
        <MenuPrimitive.Item
          disabled={pending}
          closeOnClick={false}
          onClick={() => startTransition(() => logoutAction())}
          className={cn(ITEM, "text-red-ink data-highlighted:bg-red-soft")}
        >
          {pending ? <Loader2 aria-hidden className="animate-spin" /> : <LogOut aria-hidden />} {pending ? "Keluar…" : "Keluar"}
        </MenuPrimitive.Item>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
