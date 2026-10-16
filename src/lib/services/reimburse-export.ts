// Export reimburse ke Excel (.xlsx) per bulan transaksi (2026-10-16).
import ExcelJS from "exceljs";
import type { PaymentMethod, PrismaClient, RequestStatus } from "@/generated/prisma/client";
import { toJakartaIsoDate } from "@/lib/format";
import { PAYMENT_METHOD_LABEL, projectLabel } from "@/lib/labels";
import { divisionLabels } from "./division";

const STATUS_LABEL: Record<RequestStatus, string> = { PENDING: "Menunggu", APPROVED: "Disetujui", REJECTED: "Ditolak", DRAFT: "Draft" };

export type ReimburseExportRow = {
  date: string;
  number: string;
  status: RequestStatus;
  employeeName: string;
  employeeNo: string | null;
  division: string;
  customerName: string | null;
  projectName: string | null;
  activity: string;
  participants: string;
  location: string;
  typeName: string;
  hasReceipt: boolean;
  paymentMethod: PaymentMethod;
  amount: number;
};

/**
 * Baris reimburse (per item) untuk satu bulan transaksi. `employeeId` null = semua karyawan (khusus Admin;
 * hak akses dicek di route). Sama dengan rekap cetak: draft dan pengajuan terhapus tidak ikut.
 */
export async function listReimburseExportRows(db: PrismaClient, yearMonth: string, employeeId: string | null) {
  const [y, m] = yearMonth.split("-").map(Number);
  const [items, divisions] = await Promise.all([
    db.reimbursementItem.findMany({
      where: {
        date: { gte: new Date(Date.UTC(y, m - 1, 1)), lte: new Date(Date.UTC(y, m, 0)) },
        reimbursement: { ...(employeeId ? { employeeId } : {}), deletedAt: null, status: { not: "DRAFT" } },
      },
      orderBy: [{ reimbursement: { employee: { fullName: "asc" } } }, { date: "asc" }, { id: "asc" }],
      include: {
        reimbursement: { select: { number: true, status: true, division: true, employee: { select: { fullName: true, employeeNo: true } } } },
        customer: { select: { name: true } },
        project: { select: { code: true, name: true } },
        type: { select: { name: true } },
      },
    }),
    divisionLabels(db),
  ]);
  return items.map(
    (i): ReimburseExportRow => ({
      date: toJakartaIsoDate(i.date),
      number: i.reimbursement.number,
      status: i.reimbursement.status,
      employeeName: i.reimbursement.employee.fullName,
      employeeNo: i.reimbursement.employee.employeeNo,
      division: divisions[i.reimbursement.division] ?? i.reimbursement.division,
      customerName: i.customer?.name ?? null,
      projectName: i.project ? projectLabel(i.project) : i.newAcquisition ? "New Acquisition (prospek)" : null,
      activity: i.activity,
      participants: i.participants,
      location: i.location,
      typeName: i.type.name,
      hasReceipt: i.hasReceipt,
      paymentMethod: i.paymentMethod,
      amount: Number(i.amount),
    }),
  );
}

const RUPIAH = '"Rp" #,##0';

/**
 * Workbook dua sheet: "Detail" (satu baris per item, filter + header beku + total) dan
 * "Ringkasan" (per karyawan: total disetujui / menunggu / ditolak, Personal vs Corporate).
 */
export async function buildReimburseWorkbook(rows: ReimburseExportRow[], title: string): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Office Automation — PT Artha Mitra Interdata";
  wb.created = new Date();

  const detail = wb.addWorksheet("Detail", { views: [{ state: "frozen", ySplit: 1 }] });
  detail.columns = [
    { header: "No", key: "no", width: 5 },
    { header: "Tanggal", key: "date", width: 12, style: { numFmt: "dd/mm/yyyy" } },
    { header: "No. Pengajuan", key: "number", width: 18 },
    { header: "Karyawan", key: "employeeName", width: 24 },
    { header: "NIP", key: "employeeNo", width: 12 },
    { header: "Divisi", key: "division", width: 14 },
    { header: "Status", key: "status", width: 11 },
    { header: "Company", key: "customerName", width: 24 },
    { header: "Project", key: "projectName", width: 28 },
    { header: "Aktivitas", key: "activity", width: 30 },
    { header: "Names – Position", key: "participants", width: 30 },
    { header: "Lokasi", key: "location", width: 20 },
    { header: "Tipe", key: "typeName", width: 16 },
    { header: "Bukti", key: "hasReceipt", width: 8 },
    { header: "Payment", key: "paymentMethod", width: 11 },
    { header: "Nominal", key: "amount", width: 16, style: { numFmt: RUPIAH } },
  ];
  rows.forEach((r, i) =>
    detail.addRow({
      ...r,
      no: i + 1,
      date: new Date(`${r.date}T00:00:00Z`),
      employeeNo: r.employeeNo ?? "",
      status: STATUS_LABEL[r.status],
      customerName: r.customerName ?? "",
      projectName: r.projectName ?? "",
      hasReceipt: r.hasReceipt ? "Ada" : "Tidak",
      paymentMethod: PAYMENT_METHOD_LABEL[r.paymentMethod],
    }),
  );
  styleHeader(detail.getRow(1));
  detail.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: detail.columnCount } };
  detail.getColumn("activity").alignment = { wrapText: true, vertical: "top" };
  detail.getColumn("participants").alignment = { wrapText: true, vertical: "top" };
  if (rows.length) {
    const total = detail.addRow({ paymentMethod: "Total", amount: { formula: `SUBTOTAL(9,P2:P${rows.length + 1})` } });
    total.font = { bold: true };
  }

  const summary = wb.addWorksheet("Ringkasan", { views: [{ state: "frozen", ySplit: 3 }] });
  summary.getCell("A1").value = title;
  summary.getCell("A1").font = { bold: true, size: 13 };
  summary.getRow(3).values = ["Karyawan", "NIP", "Divisi", "Jumlah pengajuan", "Disetujui", "Menunggu", "Ditolak", "Personal", "Corporate"];
  summary.columns = [{ width: 24 }, { width: 12 }, { width: 14 }, { width: 10 }, ...Array.from({ length: 5 }, () => ({ width: 16, style: { numFmt: RUPIAH } }))];
  styleHeader(summary.getRow(3));
  const byEmployee = new Map<string, ReimburseExportRow[]>();
  for (const r of rows) byEmployee.set(r.employeeName, [...(byEmployee.get(r.employeeName) ?? []), r]);
  const sum = (list: ReimburseExportRow[], ok: (r: ReimburseExportRow) => boolean) => list.filter(ok).reduce((n, r) => n + r.amount, 0);
  for (const [name, list] of byEmployee) {
    // Personal / Corporate: yang tidak ditolak.
    summary.addRow([
      name,
      list[0].employeeNo ?? "",
      list[0].division,
      new Set(list.map((r) => r.number)).size,
      sum(list, (r) => r.status === "APPROVED"),
      sum(list, (r) => r.status === "PENDING"),
      sum(list, (r) => r.status === "REJECTED"),
      sum(list, (r) => r.status !== "REJECTED" && r.paymentMethod === "PERSONAL"),
      sum(list, (r) => r.status !== "REJECTED" && r.paymentMethod === "CORPORATE"),
    ]);
  }
  if (byEmployee.size) {
    const last = 3 + byEmployee.size;
    const total = summary.addRow(["Total", "", "", ...["D", "E", "F", "G", "H", "I"].map((c) => ({ formula: `SUM(${c}4:${c}${last})` }))]);
    total.font = { bold: true };
    summary.getCell(`D${last + 1}`).numFmt = "0";
  } else {
    summary.addRow(["Tidak ada reimburse untuk transaksi bulan ini."]);
  }

  return new Uint8Array(await wb.xlsx.writeBuffer());
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.alignment = { vertical: "middle" };
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
  });
}
