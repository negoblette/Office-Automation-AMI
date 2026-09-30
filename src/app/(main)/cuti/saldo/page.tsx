import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { PersonCell } from "@/components/shared/person-cell";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { getAllCurrentBalances, getCurrentBalances } from "@/lib/services/leave-queries";
import { CutiTabs, LeaveBalanceCard } from "../leave-ui";

export const metadata: Metadata = { title: "Saldo Cuti" };

const date = (iso: string) => formatDate(`${iso}T00:00:00Z`, "short");

export default async function SaldoCutiPage() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Saldo Cuti"
        description={
          isAdmin
            ? "Saldo tahun berjalan seluruh karyawan aktif. Periode cuti = tahun kalender (Jan–Des); cuti bisa dipakai setelah genap 1 tahun masa kerja."
            : "Saldo cuti Anda tahun ini (Jan–Des)."
        }
        breadcrumbs={[{ label: "Pengajuan & Keuangan" }, { label: "Cuti & Libur", href: "/cuti" }, { label: "Saldo" }]}
      />
      <CutiTabs active="saldo" />
      {isAdmin ? <AllBalances /> : user.employeeId ? <OwnBalance employeeId={user.employeeId} /> : null}
    </div>
  );
}

async function OwnBalance({ employeeId }: { employeeId: string }) {
  const [balance] = await getCurrentBalances(prisma, [employeeId]);
  return <LeaveBalanceCard balance={balance} />;
}

async function AllBalances() {
  const balances = await getAllCurrentBalances(prisma);
  return (
    <section className="overflow-x-auto rounded-2xl bg-card shadow-card">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="bg-muted/60 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          <tr>
            {["Karyawan", "Periode", "Jatah", "Carry over", "Terpakai", "Menunggu", "Sisa"].map((h, i) => (
              <th key={h} className={i > 1 ? "px-4 py-3 text-right" : "px-4 py-3"}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {balances.map((b) => (
            <tr key={b.employeeId} className="border-t border-border">
              <td className="px-4 py-3">
                <PersonCell name={b.employeeName} subtitle={b.employeePosition} />
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                {date(b.periodStart)} – {date(b.periodEnd)}
                {b.eligibleFrom !== b.periodStart && (
                  <p className="text-xs text-warning">Mulai {date(b.eligibleFrom ?? b.firstEligibleDate)}</p>
                )}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{b.entitlement}</td>
              <td className="px-4 py-3 text-right tabular-nums">{b.carriedOver}</td>
              <td className="px-4 py-3 text-right tabular-nums">{b.used}</td>
              <td className="px-4 py-3 text-right tabular-nums">{b.pending}</td>
              <td className="px-4 py-3 text-right">
                <StatusBadge variant={b.remaining > 0 ? "success" : "neutral"} dot={false}>
                  {b.remaining} hari
                </StatusBadge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
