import { KeyRound, LogOut, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { PersonAvatar } from "@/components/shared/person-cell";
import { AccountMenu } from "./account-menu";
import { logoutAction } from "./actions";
import { Greeting } from "./greeting";
import { MobileNav } from "./mobile-nav";
import type { AppRole, NavViewer } from "./nav-config";
import type { NavBadges } from "./sidebar-nav";
import { SubmitRequestMenu } from "./submit-request-menu";
import { NotificationBell } from "./notification-bell";
import type { NotificationItem } from "@/lib/services/notifications";
import { mfaRequired } from "@/lib/roles";

type AppTopbarProps = {
  user: { name: string; role: AppRole };
  /** Isi menu di drawer HP (sama dengan sidebar). */
  viewer: NavViewer;
  badges?: NavBadges;
  /** Isi lonceng notifikasi (2026-10-13). */
  notifications?: NotificationItem[];
};

const ROLE_LABELS: Record<AppRole, string> = {
  ADMIN: "Admin",
  APPROVER: "Approver",
  STAFF: "Staf",
};

/** Topbar di dalam lembar putih (tetap sticky). */
export function AppTopbar({ user, viewer, badges, notifications = [] }: AppTopbarProps) {
  const roleLabel = viewer.isSuperAdmin ? "Super Admin" : ROLE_LABELS[user.role];
  return (
    <header className="sticky top-0 z-20 shrink-0 bg-sheet/85 backdrop-blur">
      <div className="mx-auto flex min-h-16 w-full max-w-[1200px] items-center gap-3 px-[clamp(18px,3vw,36px)] py-2.5 sm:gap-3.5">
        <MobileNav viewer={viewer} badges={badges} />
        <span className="hidden text-sm font-bold text-ink sm:inline lg:hidden">Office Automation</span>
        <Greeting name={user.name} className="hidden min-w-0 truncate text-[15px] font-semibold text-ink-2 lg:block" />

        <div className="ml-auto flex items-center gap-2 sm:gap-3.5">
          <SubmitRequestMenu />
          <NotificationBell items={notifications} />

          {/* HP (< 640 px): avatar membuka menu akun berisi MFA, Ganti password, Keluar (audit UI 2026-10-27). */}
          <div className="sm:hidden">
            <AccountMenu name={user.name} roleLabel={roleLabel} showMfa={mfaRequired(user.role)} />
          </div>

          <div className="hidden h-7 w-px bg-line sm:block" aria-hidden />

          <div className="hidden items-center gap-2.5 sm:flex">
            <PersonAvatar name={user.name} className="size-10 bg-brand-tint text-sm" />
            <div className="leading-tight">
              <p className="max-w-[180px] truncate text-sm font-bold text-ink">{user.name}</p>
              <p className="text-xs text-ink-3">{roleLabel}</p>
            </div>
          </div>

          <div className="hidden items-center gap-1 sm:flex">
            {mfaRequired(user.role) && (
              <Link href="/mfa" className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label="Keamanan akun (MFA)" title="Keamanan akun (MFA)">
                <ShieldCheck className="size-5" aria-hidden />
              </Link>
            )}
            <Link href="/ganti-password" className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label="Ganti password" title="Ganti password">
              <KeyRound className="size-5" aria-hidden />
            </Link>
          </div>

          {/* Keluar dipisah garis dari ikon lain supaya tidak tertekan tanpa sengaja. */}
          <div className="hidden h-7 w-px bg-line sm:block" aria-hidden />
          <form action={logoutAction} className="hidden sm:block">
            <Button type="submit" variant="ghost" size="icon" aria-label="Keluar" title="Keluar" className="hover:bg-red-soft hover:text-red-ink">
              <LogOut className="size-5" aria-hidden />
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
