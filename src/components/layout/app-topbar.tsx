import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/shared/person-cell";
import { logoutAction } from "./actions";
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
  STAFF: "Staf",
};

export function AppTopbar({ user, badges }: AppTopbarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-border/70 bg-background/85 px-4 backdrop-blur sm:px-6 lg:px-8">
      <MobileNav role={user.role} badges={badges} />
      <span className="hidden text-sm font-bold text-foreground sm:inline lg:hidden">Office Automation</span>

      <div className="ml-auto flex items-center gap-2 sm:gap-4">
        <SubmitRequestMenu />

        <div className="hidden h-8 w-px bg-border sm:block" aria-hidden />

        <div className="flex items-center gap-3">
          <PersonAvatar name={user.name} size="sm" />
          <div className="hidden leading-tight sm:block">
            <p className="max-w-[180px] truncate text-sm font-semibold text-foreground">{user.name}</p>
            <p className="text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</p>
          </div>
        </div>

        <form action={logoutAction}>
          <Button type="submit" variant="ghost" size="icon" aria-label="Keluar" title="Keluar">
            <LogOut className="size-4.5" />
          </Button>
        </form>
      </div>
    </header>
  );
}
