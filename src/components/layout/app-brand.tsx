import Link from "next/link";
import { cn } from "@/lib/utils";

/** Logo + nama aplikasi di pojok kiri atas sidebar. */
export function AppBrand({ className }: { className?: string }) {
  return (
    <Link href="/dashboard" className={cn("flex items-center gap-3 rounded-lg outline-none", className)}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-sm">
        OA
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-[15px] font-bold text-foreground">Office Automation</span>
        <span className="text-[11px] text-muted-foreground">PT Artha Mitra Interdata</span>
      </span>
    </Link>
  );
}
