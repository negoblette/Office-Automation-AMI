// Query halaman Inventory & tab inventory karyawan. Tanggal sebagai ISO string (aman ke client).
import type { AssetCategory, PrismaClient } from "@/generated/prisma/client";
import { type CertificateStatus, certificateStatus } from "@/lib/certificate-status";
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
  /** Status akhir support/warranty (sama dengan aturan sertifikat: ≤ 30 hari = akan berakhir). */
  supportStatus: CertificateStatus | null;
  warrantyStatus: CertificateStatus | null;
  holder: { employeeId: string; name: string; position: string; assignedAt: string } | null;
  assignmentCount: number;
};

export async function listAssets(db: PrismaClient): Promise<AssetRow[]> {
  const today = toJakartaIsoDate();
  const assets = await db.asset.findMany({
    where: { deletedAt: null },
    orderBy: [{ category: "asc" }, { deviceName: "asc" }],
    include: {
      assignments: {
        where: { returnedAt: null },
        include: { employee: { select: { id: true, fullName: true, position: true } } },
      },
      _count: { select: { assignments: true } },
    },
  });
  return assets.map((asset) => {
    const current = asset.assignments[0];
    return {
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
      supportStatus: asset.supportEnd ? certificateStatus(iso(asset.supportEnd), today) : null,
      warrantyStatus: asset.warrantyEnd ? certificateStatus(iso(asset.warrantyEnd), today) : null,
      holder: current
        ? { employeeId: current.employee.id, name: current.employee.fullName, position: current.employee.position, assignedAt: iso(current.assignedAt)! }
        : null,
      assignmentCount: asset._count.assignments,
    };
  });
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

/** Riwayat serah terima satu aset (terbaru dulu). */
export async function getAssetHistory(db: PrismaClient, assetId: string) {
  const assignments = await db.assetAssignment.findMany({
    where: { assetId },
    orderBy: { assignedAt: "desc" },
    include: assignmentInclude,
  });
  return assignments.map(toAssignmentRow);
}

/** Aset yang pernah/sedang dipegang karyawan (INV-03). */
export async function listEmployeeAssets(db: PrismaClient, employeeId: string) {
  const assignments = await db.assetAssignment.findMany({
    where: { employeeId },
    orderBy: [{ returnedAt: { sort: "desc", nulls: "first" } }, { assignedAt: "desc" }],
    include: assignmentInclude,
  });
  return assignments.map(toAssignmentRow);
}

export async function activeEmployeeOptions(db: PrismaClient) {
  const employees = await db.employee.findMany({ where: { status: "ACTIVE" }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, position: true } });
  return employees.map((e) => ({ value: e.id, label: `${e.fullName} — ${e.position}` }));
}
