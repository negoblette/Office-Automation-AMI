import { ShieldCheck, UserCheck, Users } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { listUsers } from "@/lib/services/user-admin";
import { UserTable } from "./user-table";

export const metadata: Metadata = { title: "User & Role" };

export default async function SettingUserPage() {
  const admin = await requireAdmin();
  const rows = await listUsers(prisma);
  const active = rows.filter((r) => r.isActive);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="User & Role"
        description="Kelola role, status aktif, dan reset password akun. Akun baru dibuat dari Karyawan → Tambah; karyawan resign diaktifkan kembali lewat Arsip."
        breadcrumbs={[{ label: "Kontrol & Sistem" }, { label: "Setting", href: "/setting" }, { label: "User & Role" }]}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total akun" value={rows.length} icon={Users} />
        <StatCard label="Akun aktif" value={active.length} icon={UserCheck} tone="success" />
        <StatCard label="Admin aktif" value={active.filter((r) => r.role === "ADMIN").length} icon={ShieldCheck} tone="neutral" />
      </div>
      <UserTable rows={rows} currentUserId={admin.id} />
    </div>
  );
}
