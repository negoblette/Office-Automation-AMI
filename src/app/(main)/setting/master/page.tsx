import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { DIVISION_LABEL } from "@/lib/labels";
import { listMasterData } from "@/lib/services/project-queries";
import { HealthCategoryDialog, ReimburseTypeDialog } from "./master-dialogs";

export const metadata: Metadata = { title: "Master Data" };

function ActiveBadge({ active }: { active: boolean }) {
  return <StatusBadge variant={active ? "success" : "neutral"}>{active ? "Aktif" : "Nonaktif"}</StatusBadge>;
}

export default async function MasterDataPage() {
  await requireAdmin();
  const { types, categories } = await listMasterData(prisma);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Master Data"
        description="Tipe reimburse per divisi dan kategori klaim kesehatan (SET-05). Data yang sudah dipakai cukup dinonaktifkan, tidak dihapus."
        breadcrumbs={[{ label: "Kontrol & Sistem" }, { label: "Setting", href: "/setting" }, { label: "Master Data" }]}
      />

      <section className="rounded-2xl bg-card p-5 shadow-card sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Tipe Reimburse</h2>
          <ReimburseTypeDialog />
        </div>
        <ul className="divide-y divide-border">
          {types.map((type) => (
            <li key={type.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-40 flex-1">
                <p className="font-medium">{type.name}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {type.code} · dipakai {type.usage} baris
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                {type.divisions.map((division) => (
                  <StatusBadge key={division} variant="info" dot={false}>
                    {DIVISION_LABEL[division]}
                  </StatusBadge>
                ))}
              </div>
              <ActiveBadge active={type.isActive} />
              <ReimburseTypeDialog type={type} />
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl bg-card p-5 shadow-card sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Kategori Klaim Kesehatan</h2>
          <HealthCategoryDialog />
        </div>
        <ul className="divide-y divide-border">
          {categories.map((category) => (
            <li key={category.id} className="flex items-center gap-3 py-3">
              <div className="flex-1">
                <p className="font-medium">{category.name}</p>
                <p className="text-xs text-muted-foreground">dipakai {category.usage} klaim</p>
              </div>
              <ActiveBadge active={category.isActive} />
              <HealthCategoryDialog category={category} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
