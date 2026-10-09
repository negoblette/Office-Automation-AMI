import Link from "next/link";
import { cn } from "@/lib/utils";

/** Logo + nama aplikasi di pojok kiri atas sidebar. */
export function AppBrand({ className }: { className?: string }) {
  return (
    <Link
      href="/dashboard"
      className={cn("flex items-center gap-3 rounded-[14px] px-2 pt-0.5 pb-3 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring", className)}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-extrabold text-white ring-4 ring-brand-ring">
        OA
      </span>
      <span className="flex flex-col">
        <span className="text-[15.5px] leading-tight font-extrabold tracking-[-0.02em] text-ink">Office Automation</span>
        <span className="text-xs leading-tight text-ink-3">PT Artha Mitra Interdata</span>
      </span>
    </Link>
  );
}
