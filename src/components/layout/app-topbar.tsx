import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/shared/person-cell";
import { logoutAction } from "./actions";
import { Greeting } from "./greeting";
import { MobileNav } from "./mobile-nav";
import type { AppRole } from "./nav-config";
import type { NavBadges } from "./sidebar-nav";
import { SubmitRequestMenu } from "./submit-request-menu";

type AppTopbarProps = {
  user: { name: string; role: AppRole };
  badges?: NavBadges;
};

const ROLE_LABELS: Record<AppRole, string> = {
  ADMIN: "Admin",
  APPROVER: "Approver",
  STAFF: "Staf",
};

/** Topbar di dalam lembar putih (tetap sticky). */
export function AppTopbar({ user, badges }: AppTopbarProps) {
  return (
    <header className="sticky top-0 z-20 shrink-0 bg-sheet/85 backdrop-blur">
      <div className="mx-auto flex min-h-16 w-full max-w-[1200px] items-center gap-3 px-[clamp(18px,3vw,36px)] py-2.5 sm:gap-3.5">
        <MobileNav role={user.role} badges={badges} />
        <span className="hidden text-sm font-bold text-ink sm:inline lg:hidden">Office Automation</span>
        <Greeting name={user.name} className="hidden min-w-0 truncate text-[15px] font-semibold text-ink-2 lg:block" />

        <div className="ml-auto flex items-center gap-2 sm:gap-3.5">
          <SubmitRequestMenu />

          <div className="hidden h-7 w-px bg-line sm:block" aria-hidden />

          <div className="flex items-center gap-2.5">
            <PersonAvatar name={user.name} className="size-10 bg-brand-tint text-sm" />
            <div className="hidden leading-tight sm:block">
              <p className="max-w-[180px] truncate text-sm font-bold text-ink">{user.name}</p>
              <p className="text-xs text-ink-3">{ROLE_LABELS[user.role]}</p>
            </div>
          </div>

          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="icon" aria-label="Keluar" title="Keluar">
              <LogOut className="size-5" />
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
