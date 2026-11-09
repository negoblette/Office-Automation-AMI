// Ekspor klaim kesehatan terpilih ke Excel (.xlsx) (2026-11-09), pasangan ekspor PDF di /cetak/kesehatan.
import ExcelJS from "exceljs";
import type { PrismaClient, RequestStatus } from "@/generated/prisma/client";
import { exportOwnerFilter } from "@/lib/export-ids";
import { toJakartaIsoDate } from "@/lib/format";
import { divisionLabels } from "./division";

const STATUS_LABEL: Record<RequestStatus, string> = { PENDING: "Menunggu", APPROVED: "Disetujui", REJECTED: "Ditolak", DRAFT: "Draft" };
const RUPIAH = '"Rp" #,##0';

export type HealthExportClaim = {
  number: string;
  employeeName: string;
  employeeNo: string | null;
  division: string;
  claimDate: string;
  note: string | null;
  status: RequestStatus;
  amount: number;
  approvedAmount: number | null;
  payoutMonth: string | null;
  paid: boolean;
  items: { date: string; category: string; note: string | null; amount: number }[];
};

/** Klaim terpilih (`ids`) beserta barisnya. Selain Admin hanya miliknya sendiri; draft tidak ikut. */
export async function listHealthExportClaims(db: PrismaClient, viewer: { role: string; employeeId: string | null }, ids: string[]): Promise<HealthExportClaim[]> {
  if (ids.length === 0) return [];
  const [claims, divisions] = await Promise.all([
    db.healthClaim.findMany({
      where: { id: { in: ids }, status: { not: "DRAFT" }, ...exportOwnerFilter(viewer) },
      orderBy: [{ employee: { fullName: "asc" } }, { claimDate: "asc" }, { number: "asc" }],
      include: {
        employee: { select: { fullName: true, employeeNo: true, division: true } },
        items: { orderBy: { id: "asc" }, include: { category: { select: { name: true } } } },
        payouts: { orderBy: { periodMonth: "asc" }, take: 1 },
      },
    }),
    divisionLabels(db),
  ]);
  return claims.map((c) => ({
    number: c.number,
    employeeName: c.employee.fullName,
    employeeNo: c.employee.employeeNo,
    division: divisions[c.employee.division] ?? c.employee.division,
    claimDate: toJakartaIsoDate(c.claimDate),
    note: c.note,
    status: c.status,
    amount: Number(c.amount),
    approvedAmount: c.approvedAmount === null ? null : Number(c.approvedAmount),
    payoutMonth: c.payouts[0] ? toJakartaIsoDate(c.payouts[0].periodMonth).slice(0, 7) : null,
    paid: Boolean(c.payouts[0]?.paidAt),
    items: c.items.map((item) => ({ date: toJakartaIsoDate(item.date), category: item.category.name, note: item.note, amount: Number(item.amount) })),
  }));
}

/** Workbook dua sheet: "Klaim" (satu baris per klaim, nominal diajukan & disetujui) dan "Rincian" (satu baris per baris klaim). */
export async function buildHealthWorkbook(claims: HealthExportClaim[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Office Automation — PT Artha Mitra Interdata";
  wb.created = new Date();

  const sheet = wb.addWorksheet("Klaim", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "No", key: "no", width: 5 },
    { header: "No. Klaim", key: "number", width: 18 },
    { header: "Karyawan", key: "employeeName", width: 24 },
    { header: "NIP", key: "employeeNo", width: 12 },
    { header: "Divisi", key: "division", width: 14 },
    { header: "Tanggal", key: "claimDate", width: 12, style: { numFmt: "dd/mm/yyyy" } },
    { header: "Kategori", key: "categories", width: 28 },
    { header: "Catatan", key: "note", width: 28 },
    { header: "Status", key: "status", width: 11 },
    { header: "Bulan bayar", key: "payoutMonth", width: 12 },
    { header: "Sudah dibayar", key: "paid", width: 12 },
    { header: "Diajukan", key: "amount", width: 16, style: { numFmt: RUPIAH } },
    { header: "Disetujui", key: "approvedAmount", width: 16, style: { numFmt: RUPIAH } },
  ];
  claims.forEach((c, i) =>
    sheet.addRow({
      ...c,
      no: i + 1,
      employeeNo: c.employeeNo ?? "",
      claimDate: new Date(`${c.claimDate}T00:00:00Z`),
      categories: [...new Set(c.items.map((item) => item.category))].join(", "),
      note: c.note ?? "",
      status: STATUS_LABEL[c.status],
      payoutMonth: c.payoutMonth ?? "",
      paid: c.payoutMonth ? (c.paid ? "Ya" : "Belum") : "",
      approvedAmount: c.approvedAmount ?? "",
    }),
  );
  styleHeader(sheet.getRow(1));
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
  if (claims.length) {
    const last = claims.length + 1;
    const total = sheet.addRow({ paid: "Total", amount: { formula: `SUBTOTAL(9,L2:L${last})` }, approvedAmount: { formula: `SUBTOTAL(9,M2:M${last})` } });
    total.font = { bold: true };
  }

  const detail = wb.addWorksheet("Rincian", { views: [{ state: "frozen", ySplit: 1 }] });
  detail.columns = [
    { header: "No. Klaim", key: "number", width: 18 },
    { header: "Karyawan", key: "employeeName", width: 24 },
    { header: "Tanggal", key: "date", width: 12, style: { numFmt: "dd/mm/yyyy" } },
    { header: "Kategori", key: "category", width: 22 },
    { header: "Keterangan", key: "note", width: 30 },
    { header: "Status", key: "status", width: 11 },
    { header: "Nominal", key: "amount", width: 16, style: { numFmt: RUPIAH } },
  ];
  for (const c of claims) {
    for (const item of c.items) {
      detail.addRow({ number: c.number, employeeName: c.employeeName, date: new Date(`${item.date}T00:00:00Z`), category: item.category, note: item.note ?? "", status: STATUS_LABEL[c.status], amount: item.amount });
    }
  }
  styleHeader(detail.getRow(1));
  detail.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: detail.columnCount } };

  return new Uint8Array(await wb.xlsx.writeBuffer());
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.alignment = { vertical: "middle" };
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
  });
}
