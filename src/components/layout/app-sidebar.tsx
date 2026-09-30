import { AppBrand } from "./app-brand";
import type { AppRole } from "./nav-config";
import { type NavBadges, SidebarNav } from "./sidebar-nav";

/** Sidebar kiri untuk layar lebar (≥ lg). Di HP diganti drawer `MobileNav`. */
export function AppSidebar({ role, badges }: { role: AppRole; badges?: NavBadges }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[272px] flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <div className="flex h-16 shrink-0 items-center px-5">
        <AppBrand />
      </div>
      <div className="flex-1 overflow-y-auto [scrollbar-width:thin]">
        <SidebarNav role={role} badges={badges} />
      </div>
    </aside>
  );
}
