import { CheckCheck, Clock, Inbox } from "lucide-react";
import type { Metadata } from "next";
import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { requireApprover } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { toJakartaIsoDate } from "@/lib/format";
import { listAllApprovals, listMyApprovalQueue } from "@/lib/services/approval-queries";
import { ApprovalMonitorTable, ApprovalQueueTable } from "./approval-tables";

export const metadata: Metadata = { title: "Approval" };

export default async function ApprovalPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const admin = await requireApprover();
  const isAdmin = admin.role === "ADMIN";
  const { tab } = await searchParams;
  const activeTab = tab === "monitor" ? "monitor" : "antrian";

  const [queue, all] = await Promise.all([listMyApprovalQueue(prisma, admin.id), listAllApprovals(prisma, admin.id, 500, !isAdmin)]);
  const thisMonth = toJakartaIsoDate().slice(0, 7);
  const pendingAll = all.filter((row) => row.status === "PENDING").length;
  const approvedThisMonth = all.filter((row) => row.status === "APPROVED" && row.completedAt && toJakartaIsoDate(row.completedAt).startsWith(thisMonth)).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Approval Center"
        description="Pengajuan yang menunggu persetujuan Anda, serta monitor seluruh pengajuan di semua modul."
        breadcrumbs={[{ label: "Kontrol & Sistem" }, { label: "Approval" }]}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Menunggu Anda" value={queue.length} unit="pengajuan" icon={Inbox} tone={queue.length ? "danger" : "success"} footer="Butuh tindakan Anda" />
        <StatCard label="Menunggu (semua)" value={pendingAll} unit="pengajuan" icon={Clock} tone="warning" footer="Di semua approver" />
        <StatCard label="Disetujui bulan ini" value={approvedThisMonth} unit="pengajuan" icon={CheckCheck} tone="success" footer="Termasuk yang otomatis" />
      </div>

      <LinkTabs
        label="Approval"
        active={activeTab}
        tabs={[
          { key: "antrian", label: "Antrian Saya", href: "/approval", count: queue.length },
          { key: "monitor", label: isAdmin ? "Monitor Semua" : "Riwayat Saya", href: "/approval?tab=monitor", count: all.length },
        ]}
      />

      {activeTab === "antrian" ? <ApprovalQueueTable rows={queue} /> : <ApprovalMonitorTable rows={all} />}
    </div>
  );
}
