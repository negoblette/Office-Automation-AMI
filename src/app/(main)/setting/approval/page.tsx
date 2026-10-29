import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { type FlowView, listApproverOptions, listFlows } from "@/lib/services/approval-flow";
import { cn } from "@/lib/utils";
import { FlowActions, FlowDialog } from "./flow-ui";

export const metadata: Metadata = { title: "Approval Flow" };

function FlowSteps({ flow }: { flow: FlowView }) {
  if (flow.steps.length === 0) {
    return <span className="rounded-lg bg-success-soft px-2.5 py-1 text-sm font-medium">Tanpa approval (langsung disetujui)</span>;
  }
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {flow.steps.map((step, index) => (
        <li key={step.level} className="flex items-center gap-2">
          {index > 0 && <ChevronRight className="size-4 text-muted-foreground" aria-hidden />}
          <span className="rounded-lg bg-muted px-2.5 py-1 text-sm">
            <span className="font-semibold">L{step.level}</span>{" "}
            {step.approvers.map((a, i) => (
              <span key={a.id} className={cn(!a.usable && "text-danger line-through")} title={a.usable ? undefined : "Bukan Admin aktif"}>
                {i > 0 && " / "}
                {a.name}
              </span>
            ))}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default async function SettingApprovalPage() {
  await requireAdmin();
  const [flows, approvers] = await Promise.all([listFlows(prisma), listApproverOptions(prisma)]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Approval Flow"
        description="Alur approval per modul & divisi pemohon. Perubahan hanya berlaku untuk pengajuan baru — pengajuan yang sedang berjalan tetap memakai alur saat diajukan."
        breadcrumbs={[{ label: "Kontrol & Sistem" }, { label: "Setting", href: "/setting" }, { label: "Approval Flow" }]}
        actions={<FlowDialog approvers={approvers} />}
      />

      <ul className="flex flex-col gap-3">
        {flows.map((flow) => (
          <li
            key={flow.id}
            className={cn(
              "flex flex-col gap-3 rounded-2xl bg-card p-5 shadow-card sm:flex-row sm:items-center sm:justify-between",
              !flow.isActive && "opacity-60",
            )}
          >
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">{flow.label}</h2>
                {flow.scope === "FALLBACK" && (
                  <StatusBadge variant="info" dot={false}>
                    Dipakai bila semua level terlewati
                  </StatusBadge>
                )}
                {!flow.isActive && <StatusBadge variant="neutral">Nonaktif</StatusBadge>}
                {flow.autoApproveWhenSkipped && (
                  <StatusBadge variant="success" dot={false}>
                    Pemohon = approver → langsung disetujui
                  </StatusBadge>
                )}
              </div>
              <FlowSteps flow={flow} />
            </div>
            <div className="flex items-start gap-1 self-end sm:self-center">
              <FlowDialog flow={flow} approvers={approvers} />
              <FlowActions flow={flow} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
