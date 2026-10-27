import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { TableScroll } from "@/components/shared/table-scroll";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { listDivisions } from "@/lib/services/division";
import { DivisionDialog } from "./division-dialog";

export const metadata: Metadata = { title: "Divisi" };

export default async function DivisionSettingPage() {
  await requireAdmin();
  const [divisions, counts, flows] = await Promise.all([
    listDivisions(prisma, { includeInactive: true }),
    prisma.employee.groupBy({ by: ["division"], where: { status: "ACTIVE" }, _count: true }),
    prisma.approvalFlow.findMany({ where: { scope: "REGULAR", deletedAt: null, division: { not: null } }, select: { division: true } }),
  ]);
  const countOf = new Map(counts.map((c) => [c.division, c._count]));
  const ownFlow = new Set(flows.map((f) => f.division));
  const nameOf = new Map(divisions.map((d) => [d.code, d.name]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Divisi"
        description="Daftar divisi pekerjaan. Divisi baru otomatis memakai alur approval & tipe reimburse divisi acuannya."
        breadcrumbs={[{ label: "Kontrol & Sistem" }, { label: "Setting", href: "/setting" }, { label: "Divisi" }]}
        actions={<DivisionDialog />}
      />
      <TableScroll as="section" label="Daftar divisi" className="rounded-2xl bg-card shadow-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/60 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3">Divisi</th>
              <th className="px-4 py-3">Alur approval</th>
              <th className="px-4 py-3 text-right">Karyawan aktif</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">
                <span className="sr-only">Aksi</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {divisions.map((d) => (
              <tr key={d.code} className="border-t border-border">
                <td className="px-4 py-3">
                  <p className="font-medium">{d.name}</p>
                  <p className="text-xs text-muted-foreground">{d.code}</p>
                </td>
                <td className="px-4 py-3">
                  {ownFlow.has(d.code) ? "Alur sendiri" : d.followsCode ? `Mengikuti ${nameOf.get(d.followsCode) ?? d.followsCode}` : "Alur semua divisi"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{countOf.get(d.code) ?? 0}</td>
                <td className="px-4 py-3">
                  <StatusBadge variant={d.isActive ? "success" : "neutral"}>{d.isActive ? "Aktif" : "Nonaktif"}</StatusBadge>
                </td>
                <td className="px-4 py-3 text-right">
                  <DivisionDialog division={{ code: d.code, name: d.name, followsCode: d.followsCode, isActive: d.isActive }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </div>
  );
}
