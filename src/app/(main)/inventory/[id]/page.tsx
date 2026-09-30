import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AssignmentHistory } from "@/components/employee/assignment-history";
import { PageHeader } from "@/components/shared/page-header";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { ASSET_CATEGORY_LABEL } from "@/lib/labels";
import { getAssetHistory } from "@/lib/services/asset-queries";

export const metadata: Metadata = { title: "Riwayat Unit" };

const date = (value: Date | null) => (value ? formatDate(value, "short") : "—");

export default async function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const asset = await prisma.asset.findUnique({ where: { id, deletedAt: null } });
  if (!asset) notFound();
  const history = await getAssetHistory(prisma, id);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={asset.deviceName}
        description={`SN ${asset.serialNo} · ${ASSET_CATEGORY_LABEL[asset.category]}`}
        breadcrumbs={[{ label: "Operasional & Aset" }, { label: "Inventory / Demo Unit", href: "/inventory" }, { label: asset.serialNo }]}
      />
      <section className="grid gap-4 rounded-2xl bg-card p-5 shadow-card sm:grid-cols-4">
        {[
          ["Support mulai", date(asset.supportStart)],
          ["Support berakhir", date(asset.supportEnd)],
          ["Warranty mulai", date(asset.warrantyStart)],
          ["Warranty berakhir", date(asset.warrantyEnd)],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
            <p className="mt-1 font-medium">{value}</p>
          </div>
        ))}
        {(asset.warrantyNote || asset.notes) && (
          <p className="text-sm text-muted-foreground sm:col-span-4">{[asset.warrantyNote, asset.notes].filter(Boolean).join(" · ")}</p>
        )}
      </section>
      <h2 className="text-lg font-semibold">Riwayat Serah Terima</h2>
      <AssignmentHistory rows={history} mode="asset" />
    </div>
  );
}
