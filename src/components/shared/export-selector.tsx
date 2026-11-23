"use client";

import { FileDown, FileSpreadsheet, ListChecks } from "lucide-react";
import { useMemo, useState } from "react";
import { requestStatusBadge } from "@/components/shared/approval-status";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { RequestStatus } from "@/generated/prisma/enums";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ExportItem = {
  id: string;
  employeeId: string;
  employeeName: string;
  /** Nomor pengajuan. */
  title: string;
  /** Tanggal · rincian singkat. */
  subtitle: string;
  amount: number;
  /** YYYY-MM untuk filter bulan. */
  month: string;
  status: RequestStatus;
  currentLevel: number | null;
};

const exportHref = (path: string, ids: string[]) => `${path}?ids=${ids.join(",")}`;
const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));

/** Tombol Ekspor PDF + Ekspor Excel untuk pengajuan tertentu (mis. satu pengajuan di halaman detail / baris tabel). */
export function ExportLinks({ ids, pdfPath, excelPath, compact = false }: { ids: string[]; pdfPath: string; excelPath: string; compact?: boolean }) {
  const size = compact ? "sm" : "lg";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={exportHref(pdfPath, ids)} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline", size })}>
        <FileDown aria-hidden /> {compact ? "PDF" : "Ekspor PDF"}
      </a>
      <a href={exportHref(excelPath, ids)} className={buttonVariants({ variant: "outline", size })}>
        <FileSpreadsheet aria-hidden /> {compact ? "Excel" : "Ekspor Excel"}
      </a>
    </div>
  );
}

/**
 * Panel ekspor laporan (2026-11-09): pilih karyawan (Admin; selain Admin hanya miliknya), tekan "Pilih & Ekspor" →
 * daftar pengajuan karyawan itu, centang yang mau diekspor (atau pilih semua), lalu Ekspor PDF / Excel. Hak akses tetap
 * dicek di server.
 */
export function ExportSelector({
  items,
  allowAllEmployees,
  defaultEmployeeId,
  noun,
  pdfPath,
  excelPath,
  bare = false,
}: {
  items: ExportItem[];
  /** Admin: bisa memilih karyawan lain atau semua karyawan. */
  allowAllEmployees: boolean;
  defaultEmployeeId: string | null;
  /** "reimburse" / "klaim". */
  noun: string;
  pdfPath: string;
  excelPath: string;
  /** Tanpa kartu sendiri — ditanam di panel lain (panel Ekspor kesehatan, 2026-11-23). */
  bare?: boolean;
}) {
  const employees = useMemo(
    () => [...new Map(items.map((item) => [item.employeeId, item.employeeName])).entries()].sort((a, b) => a[1].localeCompare(b[1], "id")),
    [items],
  );
  const [employeeId, setEmployeeId] = useState(() => (defaultEmployeeId && employees.some(([id]) => id === defaultEmployeeId) ? defaultEmployeeId : (employees[0]?.[0] ?? "")));
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const ofEmployee = items.filter((item) => !employeeId || item.employeeId === employeeId);
  const months = [...new Set(ofEmployee.map((item) => item.month))].sort().reverse();
  const visible = ofEmployee.filter((item) => !month || item.month === month);
  const chosen = visible.filter((item) => selected.has(item.id)).map((item) => item.id);
  const allChosen = visible.length > 0 && chosen.length === visible.length;
  const who = employeeId ? (employees.find(([id]) => id === employeeId)?.[1] ?? "") : "Semua karyawan";

  const toggle = (id: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <section className={cn("flex flex-wrap items-end gap-3", !bare && "rounded-2xl bg-card p-4 shadow-card")}>
      {allowAllEmployees && (
        <label className="flex flex-col gap-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Karyawan
          <select
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            className="h-10 min-w-56 rounded-lg border border-input bg-background px-3 text-sm text-foreground normal-case"
          >
            {employees.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
            <option value="">Semua karyawan</option>
          </select>
        </label>
      )}
      <Button
        size="lg"
        variant="outline"
        disabled={ofEmployee.length === 0}
        onClick={() => {
          setMonth("");
          setSelected(new Set());
          setOpen(true);
        }}
      >
        <ListChecks aria-hidden /> Pilih &amp; Ekspor
      </Button>
      <p className="text-sm text-muted-foreground">{ofEmployee.length === 0 ? `Belum ada ${noun} yang bisa diekspor.` : `Ekspor laporan ${noun} ke PDF atau Excel.`}</p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Ekspor {noun} — {who}</DialogTitle>
            <DialogDescription>Centang {noun} yang mau diekspor, lalu pilih Ekspor PDF atau Ekspor Excel.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm font-semibold">
              <input
                type="checkbox"
                className="size-[18px] cursor-pointer accent-primary"
                checked={allChosen}
                ref={(el) => {
                  if (el) el.indeterminate = chosen.length > 0 && !allChosen;
                }}
                onChange={(event) => setSelected(event.target.checked ? new Set(visible.map((item) => item.id)) : new Set())}
              />
              Pilih semua ({visible.length})
            </label>
            <select
              aria-label="Filter bulan"
              value={month}
              onChange={(event) => {
                setMonth(event.target.value);
                setSelected(new Set());
              }}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="">Semua bulan</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </div>
          <ul className="flex max-h-96 flex-col divide-y divide-border overflow-y-auto rounded-xl shadow-[inset_0_0_0_1px_var(--line)]">
            {visible.map((item) => {
              const badge = requestStatusBadge(item.status, item.currentLevel);
              return (
                <li key={item.id}>
                  <label className={cn("flex cursor-pointer items-start gap-3 px-4 py-3", selected.has(item.id) && "bg-info-soft/50")}>
                    <input
                      type="checkbox"
                      className="mt-0.5 size-[18px] shrink-0 cursor-pointer accent-primary"
                      checked={selected.has(item.id)}
                      onChange={(event) => toggle(item.id, event.target.checked)}
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
                      <span className="font-semibold">
                        {item.title}
                        {!employeeId && <span className="font-normal text-muted-foreground"> · {item.employeeName}</span>}
                      </span>
                      <span className="truncate text-muted-foreground">{item.subtitle}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-semibold tabular-nums">{formatRupiah(item.amount)}</span>
                      <StatusBadge variant={badge.variant}>{badge.label}</StatusBadge>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <DialogFooter className="items-center">
            <p className="mr-auto text-sm text-muted-foreground">{chosen.length} dipilih</p>
            {chosen.length ? (
              <ExportLinks ids={chosen} pdfPath={pdfPath} excelPath={excelPath} />
            ) : (
              <>
                <Button size="lg" variant="outline" disabled>
                  <FileDown aria-hidden /> Ekspor PDF
                </Button>
                <Button size="lg" variant="outline" disabled>
                  <FileSpreadsheet aria-hidden /> Ekspor Excel
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
