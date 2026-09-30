import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { countPendingApprovals } from "@/lib/services/approval-queries";

/**
 * Shell aplikasi (sidebar + topbar). `requireUser()` di sini hanya untuk data user
 * di shell; setiap page tetap memanggil guard sendiri karena layout tidak
 * di-render ulang saat navigasi.
 */
export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const badges = user.role === "ADMIN" ? { "/approval": await countPendingApprovals(prisma, user.id) } : undefined;

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <AppSidebar role={user.role} badges={badges} />
      <div className="flex min-h-screen flex-1 flex-col lg:pl-[272px]">
        <AppTopbar user={{ name: user.name, role: user.role }} badges={badges} />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
