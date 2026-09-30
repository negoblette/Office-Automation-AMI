import { MonitorSmartphone } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDate } from "@/lib/format";
import { ASSET_CATEGORY_LABEL } from "@/lib/labels";
import type { AssignmentRow } from "@/lib/services/asset-queries";

const date = (iso: string) => formatDate(`${iso}T00:00:00Z`, "short");

/**
 * Tabel riwayat serah terima. `mode="employee"` (tab karyawan / Profil Saya, INV-03) menampilkan
 * perangkat; `mode="asset"` (detail unit) menampilkan pemegang.
 */
export function AssignmentHistory({ rows, mode }: { rows: AssignmentRow[]; mode: "employee" | "asset" }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={MonitorSmartphone}
        title={mode === "employee" ? "Belum pernah memegang perangkat" : "Belum pernah diserahterimakan"}
      />
    );
  }
  return (
    <section className="overflow-x-auto rounded-2xl bg-card shadow-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-muted/60 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          <tr>
            <th className="px-4 py-3">{mode === "employee" ? "Perangkat" : "Pemegang"}</th>
            <th className="px-4 py-3">Diserahkan</th>
            <th className="px-4 py-3">Dikembalikan</th>
            <th className="px-4 py-3">Catatan</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-border">
              <td className="px-4 py-3">
                {mode === "employee" ? (
                  <>
                    <p className="font-medium">{row.deviceName}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {row.serialNo} · {ASSET_CATEGORY_LABEL[row.category]}
                    </p>
                  </>
                ) : (
                  <p className="font-medium">{row.employeeName}</p>
                )}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">{date(row.assignedAt)}</td>
              <td className="px-4 py-3 whitespace-nowrap">
                {row.returnedAt ? date(row.returnedAt) : <StatusBadge variant="info">Masih dipegang</StatusBadge>}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{row.note ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
