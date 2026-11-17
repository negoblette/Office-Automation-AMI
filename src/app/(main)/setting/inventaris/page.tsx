import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { TableScroll } from "@/components/shared/table-scroll";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { rackRangeLabel } from "@/lib/inventory";
import { ROLE_LABEL } from "@/lib/labels";
import { getTrialFormCounter } from "@/lib/services/demo-loan";
import { getOperationalUserIds } from "@/lib/services/inventory-access";
import { listRacks } from "@/lib/services/storage-rack";
import { DeleteRackButton, OperationalDialog, RackDialog, TrialFormCounterDialog } from "./inventory-setting-dialogs";

export const metadata: Metadata = { title: "Inventaris & Rak" };

const userLabel = (user: { email: string; role: keyof typeof ROLE_LABEL; employee: { fullName: string; position: string } | null }) =>
  user.employee ? `${user.employee.fullName} — ${user.employee.position} (${ROLE_LABEL[user.role]})` : `${user.email} (${ROLE_LABEL[user.role]})`;

/** Setting → Inventaris & Rak (2026-11-17, Admin): siapa Operational, dan daftar rak penyimpanan unit. */
export default async function InventorySettingPage() {
  await requireAdmin();
  const [operationalIds, users, racks, counter] = await Promise.all([
    getOperationalUserIds(prisma),
    prisma.user.findMany({
      orderBy: { email: "asc" },
      select: { id: true, email: true, role: true, isActive: true, employee: { select: { fullName: true, position: true } } },
    }),
    listRacks(prisma),
    getTrialFormCounter(prisma),
  ]);
  const operational = operationalIds.map((id) => users.find((user) => user.id === id)).filter((user) => user !== undefined);
  const options = users
    .filter((user) => user.isActive)
    .map((user) => ({ value: user.id, label: userLabel(user) }))
    .sort((a, b) => a.label.localeCompare(b.label, "id"));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Inventaris & Rak"
        description="Atur siapa Operational untuk peminjaman unit demo, dan daftar rak tempat unit disimpan."
        breadcrumbs={[{ label: "Kontrol & Sistem" }, { label: "Setting", href: "/setting" }, { label: "Inventaris & Rak" }]}
      />

      <section className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl space-y-1">
            <h2 className="text-base font-semibold">Operational</h2>
            <p className="text-sm text-muted-foreground">
              Menyiapkan peminjaman yang sudah disetujui (pilih Item Sender, cetak form), mengecek barang yang kembali, menerima peringatan jatuh tempo, dan
              bisa mengelola unit & posisi rak. Mereka
              otomatis mendapat menu Inventaris walau bukan divisi Engineer / Sales.
            </p>
          </div>
          <OperationalDialog selected={operationalIds} users={options} />
        </div>
        {operational.length === 0 ? (
          <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm font-medium text-warning">
            Belum ada Operational. Pengajuan peminjaman dan peringatan jatuh tempo tidak punya penerima sampai diatur.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {operational.map((user) => (
              <li key={user.id} className="flex items-center gap-2 rounded-full bg-panel px-3.5 py-1.5 text-sm font-semibold text-ink">
                {user.employee?.fullName ?? user.email}
                {!user.isActive && (
                  <StatusBadge variant="neutral" dot={false}>
                    Nonaktif
                  </StatusBadge>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl space-y-1">
            <h2 className="text-base font-semibold">Nomor Product Trial Form</h2>
            <p className="text-sm text-muted-foreground">
              Format <span className="font-mono">NNN/AMI-PTF/bulan Romawi/tahun</span>. Nomor terbit saat peminjaman diajukan, urut ulang dari 001 tiap
              tahun.
            </p>
          </div>
          <TrialFormCounterDialog year={counter.year} lastValue={counter.lastValue} />
        </div>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Nomor terakhir {counter.year}</dt>
            <dd className="mt-1 font-mono text-base font-semibold tabular-nums">{counter.lastValue ? String(counter.lastValue).padStart(3, "0") : "Belum ada"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Form berikutnya (bila diajukan bulan ini)</dt>
            <dd className="mt-1 font-mono text-base font-semibold">{counter.nextNumber}</dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Rak penyimpanan</h2>
            <p className="text-sm text-muted-foreground">Posisi = huruf kolom + nomor baris (A1, B3, …). Satu posisi boleh berisi beberapa unit.</p>
          </div>
          <RackDialog />
        </div>
        <TableScroll as="section" label="Daftar rak" className="rounded-2xl bg-card shadow-card">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted/60 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3">Rak</th>
                <th className="px-4 py-3">Ukuran</th>
                <th className="px-4 py-3">Posisi</th>
                <th className="px-4 py-3 text-right">Unit tersimpan</th>
                <th className="px-4 py-3">
                  <span className="sr-only">Aksi</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {racks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    Belum ada rak. Tambahkan rak dulu supaya unit bisa dicatat posisinya.
                  </td>
                </tr>
              ) : (
                racks.map((rack) => (
                  <tr key={rack.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <p className="font-medium">{rack.name}</p>
                      {rack.note && <p className="text-xs text-muted-foreground">{rack.note}</p>}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {rack.columns} kolom × {rack.rows} baris
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{rackRangeLabel(rack)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{rack.assetCount}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <RackDialog rack={rack} />
                        <DeleteRackButton rack={rack} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableScroll>
      </section>
    </div>
  );
}
