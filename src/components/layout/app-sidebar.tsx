import { cn } from "@/lib/utils";
import { AppBrand } from "./app-brand";
import shell from "./app-shell.module.css";
import type { AppRole } from "./nav-config";
import { type NavBadges, SidebarNav } from "./sidebar-nav";

/** Sidebar kiri untuk layar lebar (≥ lg), di atas latar bertitik. Di HP diganti drawer `MobileNav`. */
export function AppSidebar({ role, badges }: { role: AppRole; badges?: NavBadges }) {
  return (
    <aside className={cn("fixed inset-y-0 left-0 z-30 hidden w-[252px] flex-col overflow-hidden lg:flex", shell.sidebar)}>
      <div className="shrink-0 pt-[22px] pr-1 pl-4">
        <AppBrand />
      </div>
      {/* Batang gulir disembunyikan supaya tidak memotong label menu; sidebar tetap bisa digulir. */}
      <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <SidebarNav role={role} badges={badges} />
      </div>
    </aside>
  );
}
