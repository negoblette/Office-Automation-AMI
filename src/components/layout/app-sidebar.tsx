import { cn } from "@/lib/utils";
import { AppBrand } from "./app-brand";
import shell from "./app-shell.module.css";
import type { AppRole } from "./nav-config";
import { type NavBadges, SidebarNav } from "./sidebar-nav";

/** Sidebar kiri untuk layar lebar (≥ lg), di atas latar bertitik. Di HP diganti drawer `MobileNav`. */
export function AppSidebar({ role, badges }: { role: AppRole; badges?: NavBadges }) {
  return (
    <aside className={cn("fixed inset-y-0 left-0 z-30 isolate hidden w-[252px] flex-col overflow-hidden lg:flex", shell.sidebar)}>
      <SidebarSeal />
      <div className="shrink-0 pt-[22px] pr-1 pl-4">
        <AppBrand />
      </div>
      <div className="flex-1 overflow-y-auto [scrollbar-width:thin]">
        <SidebarNav role={role} badges={badges} />
      </div>
    </aside>
  );
}

/** Stempel samar di bawah sidebar — dekorasi saja. */
function SidebarSeal() {
  return (
    <svg className={shell.seal} width="330" height="330" viewBox="0 0 200 200" aria-hidden>
      <defs>
        <path id="segel-sidebar" d="M100 100m-73 0a73 73 0 1 1 146 0a73 73 0 1 1 -146 0" />
      </defs>
      <circle cx="100" cy="100" r="96" strokeWidth="2.6" />
      <circle cx="100" cy="100" r="89" strokeWidth="1" />
      <circle cx="100" cy="100" r="62" strokeWidth="1" />
      <text className="font-mono" fontSize="12.5" fontWeight="600">
        <textPath href="#segel-sidebar" textLength="452" lengthAdjust="spacing">
          OFFICE AUTOMATION • PT ARTHA MITRA INTERDATA •{" "}
        </textPath>
      </text>
    </svg>
  );
}
