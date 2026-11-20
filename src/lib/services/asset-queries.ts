// Query halaman Inventory & tab inventory karyawan. Tanggal sebagai ISO string (aman ke client).
import type { AssetCategory, AssetOwnership, DemoLoanStatus, PrismaClient } from "@/generated/prisma/client";
import { type CertificateStatus, certificateStatus } from "@/lib/certificate-status";
import { toJakartaIsoDate } from "@/lib/format";
import { heldLoanItemWhere } from "./demo-loan-hold";
import { type LastReturn, lastReturnConditions } from "./demo-loan-queries";

const iso = (date: Date | null) => (date ? toJakartaIsoDate(date) : null);

export type AssetRow = {
  id: string;
  deviceName: string;
  serialNo: string;
  category: AssetCategory;
  supportStart: string | null;
  supportEnd: string | null;
  warrantyStart: string | null;
  warrantyEnd: string | null;
  warrantyNote: string | null;
  notes: string | null;
  /** Kepemilikan (2026-11-17): milik AMI atau titipan principal / distributor. */
  ownership: AssetOwnership;
  ownerName: string | null;
  /** Lokasi penyimpanan (2026-11-17); null = tidak disimpan di rak. */
  rackId: string | null;
  rackName: string | null;
  rackPosition: string | null;
  /** Status akhir support/warranty (sama dengan aturan sertifikat: ≤ 30 hari = akan berakhir). */
  supportStatus: CertificateStatus | null;
  warrantyStatus: CertificateStatus | null;
  /** Riwayat serah terima lama ke karyawan (tidak dipakai lagi sejak 2026-11-17); > 0 = unit tidak bisa dihapus. */
  assignmentCount: number;
  /** Pernah masuk peminjaman (Product Trial Form); > 0 = unit tidak bisa dihapus. */
  loanCount: number;
  /**
   * Peminjaman yang menahan unit ini (Menunggu approval / Disiapkan / Dipinjam / Pengambilan, atau Tindak lanjut bila unit
   * ini yang bermasalah); null = tersedia.
   */
  activeLoan: { id: string; status: DemoLoanStatus; borrowerName: string } | null;
  /** Kondisi saat terakhir kembali dari peminjaman (Tahap 16.5); null = belum pernah kembali. */
  lastReturn: LastReturn | null;
  /** Penerimaan barang (HAF) tempat unit principal / distributor ini masuk (2026-11-20); null = milik AMI / data lama. */
  receipt: { id: string; hafNumber: string } | null;
};

/** Semua unit aktif, atau satu unit (`assetId`, halaman detail). */
export async function listAssets(db: PrismaClient, assetId?: string): Promise<AssetRow[]> {
  const today = toJakartaIsoDate();
  const assets = await db.asset.findMany({
    where: { deletedAt: null, ...(assetId ? { id: assetId } : {}) },
    orderBy: [{ category: "asc" }, { deviceName: "asc" }],
    include: {
      rack: { select: { name: true } },
      receipt: { select: { id: true, hafNumber: true } },
      _count: { select: { assignments: true, loanItems: true } },
      loanItems: {
        where: heldLoanItemWhere(),
        select: { loan: { select: { id: true, status: true, borrowerName: true } } },
        take: 1,
      },
    },
  });
  const lastReturns = await lastReturnConditions(db, assetId ? [assetId] : undefined);
  return assets.map((asset) => ({
    id: asset.id,
    deviceName: asset.deviceName,
    serialNo: asset.serialNo,
    category: asset.category,
    supportStart: iso(asset.supportStart),
    supportEnd: iso(asset.supportEnd),
    warrantyStart: iso(asset.warrantyStart),
    warrantyEnd: iso(asset.warrantyEnd),
    warrantyNote: asset.warrantyNote,
    notes: asset.notes,
    ownership: asset.ownership,
    ownerName: asset.ownerName,
    rackId: asset.rackId,
    rackName: asset.rack?.name ?? null,
    rackPosition: asset.rackPosition,
    supportStatus: asset.supportEnd ? certificateStatus(iso(asset.supportEnd), today) : null,
    warrantyStatus: asset.warrantyEnd ? certificateStatus(iso(asset.warrantyEnd), today) : null,
    assignmentCount: asset._count.assignments,
    loanCount: asset._count.loanItems,
    activeLoan: asset.loanItems[0]?.loan ?? null,
    lastReturn: lastReturns.get(asset.id) ?? null,
    receipt: asset.receipt,
  }));
}

export type AssignmentRow = {
  id: string;
  assetId: string;
  deviceName: string;
  serialNo: string;
  category: AssetCategory;
  employeeName: string;
  assignedAt: string;
  returnedAt: string | null;
  note: string | null;
};

const assignmentInclude = {
  asset: { select: { id: true, deviceName: true, serialNo: true, category: true } },
  employee: { select: { fullName: true } },
} as const;

function toAssignmentRow(a: {
  id: string;
  assignedAt: Date;
  returnedAt: Date | null;
  note: string | null;
  asset: { id: string; deviceName: string; serialNo: string; category: AssetCategory };
  employee: { fullName: string };
}): AssignmentRow {
  return {
    id: a.id,
    assetId: a.asset.id,
    deviceName: a.asset.deviceName,
    serialNo: a.asset.serialNo,
    category: a.asset.category,
    employeeName: a.employee.fullName,
    assignedAt: iso(a.assignedAt)!,
    returnedAt: iso(a.returnedAt),
    note: a.note,
  };
}

/** Aset yang pernah/sedang dipegang karyawan (INV-03; data lama, tampil di Asset Kantor — serah terima baru tidak ada lagi). */
export async function listEmployeeAssets(db: PrismaClient, employeeId: string) {
  const assignments = await db.assetAssignment.findMany({
    where: { employeeId },
    orderBy: [{ returnedAt: { sort: "desc", nulls: "first" } }, { assignedAt: "desc" }],
    include: assignmentInclude,
  });
  return assignments.map(toAssignmentRow);
}
