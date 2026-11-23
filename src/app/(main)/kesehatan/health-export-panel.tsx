"use client";

import { FileSpreadsheet, FileText } from "lucide-react";
import { useMemo, useState } from "react";
import { type ExportItem, ExportSelector } from "@/components/shared/export-selector";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));

const selectClass =
  "h-11 min-w-0 cursor-pointer rounded-[14px] border-0 bg-white px-3 text-sm font-medium text-ink shadow-[inset_0_0_0_1px_var(--edge)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--brand),0_0_0_4px_var(--brand-ring)]";

type Mode = "month" | "pick";
const MODES: { value: Mode; label: string }[] = [
  { value: "month", label: "Per bulan" },
  { value: "pick", label: "Pilih klaim" },
];

/**
 * Satu panel Ekspor klaim kesehatan (2026-11-23, permintaan user: gabungan Rekap bulanan & Pilih & Ekspor).
 * - Per bulan: karyawan (Admin: satu / semua) + bulan → PDF rekap (`/cetak/kesehatan?bulan=&karyawan=`, dengan total
 *   disetujui & ringkasan semua karyawan) atau Excel (klaim bulan itu lewat `?ids=`).
 * - Pilih klaim: centang klaim tertentu → PDF / Excel (`ExportSelector`).
 * Hanya klaim menunggu / disetujui; bulan = bulan tanggal klaim. Hak akses tetap dicek di server.
 */
export function HealthExportPanel({ items, allowAllEmployees, defaultEmployeeId }: { items: ExportItem[]; allowAllEmployees: boolean; defaultEmployeeId: string | null }) {
  const [mode, setMode] = useState<Mode>("month");
  const employees = useMemo(
    () => [...new Map(items.map((item) => [item.employeeId, item.employeeName])).entries()].sort((a, b) => a[1].localeCompare(b[1], "id")),
    [items],
  );
  const [employeeId, setEmployeeId] = useState(allowAllEmployees ? "" : (defaultEmployeeId ?? ""));
  const ofEmployee = useMemo(() => items.filter((item) => !employeeId || item.employeeId === employeeId), [items, employeeId]);
  const months = useMemo(() => [...new Set(ofEmployee.map((item) => item.month))].sort().reverse(), [ofEmployee]);
  const [month, setMonth] = useState(months[0] ?? "");
  const selectedMonth = months.includes(month) ? month : (months[0] ?? "");
  const monthIds = ofEmployee.filter((item) => item.month === selectedMonth).map((item) => item.id);

  return (
    <section aria-labelledby="health-export-title" className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="health-export-title" className="text-base font-semibold">
            Ekspor klaim
          </h2>
          <p className="text-sm text-muted-foreground">
            {mode === "month"
              ? `Semua klaim menunggu / disetujui berdasarkan tanggal klaim di bulan itu. PDF memuat total yang disetujui${allowAllEmployees ? "; “Semua karyawan” = ringkasan seluruh karyawan dalam satu PDF" : ""}.`
              : "Centang klaim tertentu yang mau diekspor ke PDF atau Excel."}
          </p>
        </div>
        <div role="group" aria-label="Cara ekspor" className="flex shrink-0 gap-0.5 rounded-[16px] bg-panel p-1 shadow-[inset_0_0_0_1px_rgb(var(--shade)/0.05)]">
          {MODES.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={mode === option.value}
              onClick={() => setMode(option.value)}
              className={cn(
                "min-h-10 cursor-pointer rounded-[12px] px-4 text-sm font-semibold text-ink-3 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-ink",
                mode === option.value && "bg-white text-ink shadow-card",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {mode === "pick" ? (
        <ExportSelector
          bare
          items={items}
          allowAllEmployees={allowAllEmployees}
          defaultEmployeeId={defaultEmployeeId}
          noun="klaim"
          pdfPath="/cetak/kesehatan"
          excelPath="/api/export/kesehatan"
        />
      ) : months.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada klaim menunggu / disetujui untuk diekspor.</p>
      ) : (
        <form action="/cetak/kesehatan" method="get" target="_blank" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          {allowAllEmployees && (
            <label className="flex min-w-0 flex-col gap-1.5 text-[13px] font-bold text-ink-2 sm:w-64">
              Karyawan
              <select name="karyawan" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className={selectClass}>
                <option value="">Semua karyawan</option>
                {employees.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex min-w-0 flex-col gap-1.5 text-[13px] font-bold text-ink-2 sm:w-56">
            Bulan
            <select name="bulan" value={selectedMonth} onChange={(event) => setMonth(event.target.value)} className={selectClass}>
              {months.map((value) => (
                <option key={value} value={value}>
                  {monthLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="lg">
              <FileText aria-hidden /> Ekspor PDF
            </Button>
            <a href={`/api/export/kesehatan?ids=${monthIds.join(",")}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
              <FileSpreadsheet aria-hidden /> Ekspor Excel
            </a>
            <span className="text-sm text-muted-foreground">{monthIds.length} klaim</span>
          </div>
        </form>
      )}
    </section>
  );
}
