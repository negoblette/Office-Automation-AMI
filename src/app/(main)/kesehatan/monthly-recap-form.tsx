"use client";

import { FileText } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

export type RecapClaim = { employeeId: string; employeeName: string; month: string };

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));

const selectClass =
  "h-11 min-w-0 cursor-pointer rounded-[14px] border-0 bg-white px-3 text-sm font-medium text-ink shadow-[inset_0_0_0_1px_var(--edge)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--brand),0_0_0_4px_var(--brand-ring)]";

/**
 * Rekap bulanan klaim kesehatan → PDF (2026-11-19): pilih karyawan (Admin: satu atau semua; staf: dirinya sendiri) dan
 * bulan (hanya bulan yang punya klaim menunggu / disetujui), lalu halaman cetak terbuka. Formulir GET biasa ke
 * `/cetak/kesehatan?bulan=&karyawan=` — hak akses tetap dicek ulang di server.
 */
export function MonthlyRecapForm({ claims, allowAllEmployees, defaultEmployeeId }: { claims: RecapClaim[]; allowAllEmployees: boolean; defaultEmployeeId: string | null }) {
  const employees = useMemo(
    () => [...new Map(claims.map((claim) => [claim.employeeId, claim.employeeName])).entries()].sort((a, b) => a[1].localeCompare(b[1], "id")),
    [claims],
  );
  const [employeeId, setEmployeeId] = useState(allowAllEmployees ? "" : (defaultEmployeeId ?? ""));
  const months = useMemo(
    () => [...new Set(claims.filter((claim) => !employeeId || claim.employeeId === employeeId).map((claim) => claim.month))].sort().reverse(),
    [claims, employeeId],
  );
  const [month, setMonth] = useState(months[0] ?? "");
  const selectedMonth = months.includes(month) ? month : (months[0] ?? "");

  return (
    <section aria-labelledby="monthly-recap-title" className="flex flex-col gap-3 rounded-2xl bg-card p-5 shadow-card">
      <div>
        <h2 id="monthly-recap-title" className="text-base font-semibold">
          Rekap bulanan (PDF)
        </h2>
        <p className="text-sm text-muted-foreground">
          Semua klaim menunggu / disetujui berdasarkan tanggal klaim, lengkap dengan plafon & sisa tahun itu.
          {allowAllEmployees && " Pilih “Semua karyawan” untuk ringkasan seluruh karyawan dalam satu PDF."}
        </p>
      </div>
      {months.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada klaim menunggu / disetujui untuk direkap.</p>
      ) : (
        <form action="/cetak/kesehatan" method="get" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
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
          <Button type="submit" size="lg">
            <FileText aria-hidden /> Cetak PDF
          </Button>
        </form>
      )}
    </section>
  );
}
