import { AppSidebar } from "@/components/layout/app-sidebar";
import shell from "@/components/layout/app-shell.module.css";
import { AppTopbar } from "@/components/layout/app-topbar";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { canApprove } from "@/lib/roles";
import { countPendingApprovals } from "@/lib/services/approval-queries";
import { cn } from "@/lib/utils";

/**
 * Shell aplikasi (sidebar + topbar). `requireUser()` di sini hanya untuk data user
 * di shell; setiap page tetap memanggil guard sendiri karena layout tidak
 * di-render ulang saat navigasi.
 *
 * Tampilan: sidebar di atas latar bertitik, topbar + konten di satu lembar putih membulat.
 * `overflow-clip` (bukan hidden) supaya topbar tetap sticky terhadap layar.
 */
export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const badges = canApprove(user.role) ? { "/approval": await countPendingApprovals(prisma, user.id) } : undefined;

  return (
    <div className={cn("flex min-h-screen flex-1 flex-col", shell.ground)}>
      <a
        href="#konten"
        className="absolute -top-16 left-4 z-[60] rounded-full bg-ink px-4 py-2.5 text-sm font-bold text-white transition-[top] duration-300 ease-smooth focus:top-3 motion-reduce:transition-none"
      >
        Lewati ke konten
      </a>
      <AppSidebar role={user.role} badges={badges} />
      <div className="flex min-h-screen flex-1 flex-col p-2 lg:py-3 lg:pr-3 lg:pl-[264px]">
        <div className="flex min-w-0 flex-1 flex-col overflow-clip rounded-[22px] bg-sheet shadow-(--elev-sheet) lg:rounded-[28px]">
          <AppTopbar user={{ name: user.name, role: user.role }} badges={badges} />
          <main id="konten" tabIndex={-1} className="mx-auto w-full max-w-[1200px] flex-1 px-[clamp(18px,3vw,36px)] pt-3.5 pb-12 outline-none">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
