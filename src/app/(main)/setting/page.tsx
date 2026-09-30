import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCog, ChevronRight, Clock, Database, GitBranch, HeartPulse, UserCog, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { requireAdmin } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Setting" };

const SETTING_SECTIONS: { title: string; description: string; href: string; icon: LucideIcon }[] = [
  {
    title: "User & Role",
    description: "Kelola akun, role, status aktif, dan reset password.",
    href: "/setting/user",
    icon: UserCog,
  },
  {
    title: "Approval Flow",
    description: "Atur alur approval per modul dan divisi.",
    href: "/setting/approval",
    icon: GitBranch,
  },
  {
    title: "Jatah Cuti & Carry Over",
    description: "Jatah cuti per masa kerja dan batas carry over.",
    href: "/setting/cuti",
    icon: CalendarCog,
  },
  {
    title: "Jam Kerja & Absensi",
    description: "Jam masuk & pulang untuk menandai terlambat / pulang cepat.",
    href: "/setting/absensi",
    icon: Clock,
  },
  {
    title: "Plafon Kesehatan",
    description: "Plafon kesehatan tahunan per karyawan.",
    href: "/setting/kesehatan",
    icon: HeartPulse,
  },
  {
    title: "Master Data",
    description: "Tipe reimburse per divisi dan kategori klaim kesehatan.",
    href: "/setting/master",
    icon: Database,
  },
];

export default async function SettingPage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Setting"
        description="Pengaturan sistem: user, approval flow, cuti, plafon kesehatan, dan master data."
        breadcrumbs={[{ label: "Kontrol & Sistem" }, { label: "Setting" }]}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {SETTING_SECTIONS.map(({ title, description, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-start gap-4 rounded-2xl bg-card p-5 shadow-card transition-shadow outline-none hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-info-soft text-primary">
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-foreground">{title}</span>
              <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span>
            </span>
            <ChevronRight
              className="mt-2.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
