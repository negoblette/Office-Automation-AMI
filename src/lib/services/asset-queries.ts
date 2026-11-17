// Query halaman Inventory & tab inventory karyawan. Tanggal sebagai ISO string (aman ke client).
import type { AssetCategory, AssetOwnership, DemoLoanStatus, PrismaClient } from "@/generated/prisma/client";
import { type CertificateStatus, certificateStatus } from "@/lib/certificate-status";
import { ACTIVE_LOAN_STATUSES } from "@/lib/demo-loan";
import { toJakartaIsoDate } from "@/lib/format";

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
  /** Peminjaman aktif yang menahan unit ini (Menunggu tinjauan / Disiapkan / Dipinjam); null = tersedia. */
  activeLoan: { id: string; status: DemoLoanStatus; borrowerName: string } | null;
};

/** Semua unit aktif, atau satu unit (`assetId`, halaman detail). */
export async function listAssets(db: PrismaClient, assetId?: string): Promise<AssetRow[]> {
  const today = toJakartaIsoDate();
  const assets = await db.asset.findMany({
    where: { deletedAt: null, ...(assetId ? { id: assetId } : {}) },
    orderBy: [{ category: "asc" }, { deviceName: "asc" }],
    include: {
      rack: { select: { name: true } },
      _count: { select: { assignments: true, loanItems: true } },
      loanItems: {
        where: { loan: { status: { in: [...ACTIVE_LOAN_STATUSES] } } },
        select: { loan: { select: { id: true, status: true, borrowerName: true } } },
        take: 1,
      },
    },
  });
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
