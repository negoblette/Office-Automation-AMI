// Query halaman Penerimaan Barang (2026-11-20). Tanggal sebagai ISO string (aman ke client).
import type { AssetCategory, AssetOwnership, PrismaClient } from "@/generated/prisma/client";
import type { SelectOption } from "@/components/form/select-field";
import { toJakartaIsoDate } from "@/lib/format";
import { INVENTORY_DIVISIONS, rackLocationLabel } from "@/lib/inventory";

const personName = (user: { email: string; employee: { fullName: string } | null }) => user.employee?.fullName ?? user.email;

export type GoodsReceiptRow = {
  id: string;
  hafNumber: string;
  ownership: AssetOwnership;
  ownerName: string;
  contactName: string;
  receivedDate: string;
  picName: string;
  preparedByName: string;
  unitCount: number;
  /** "Switch 24 port ×2 · SFP+ (10G)" */
  unitSummary: string;
};

const summarize = (assets: { deviceName: string }[]) => {
  const counts = new Map<string, number>();
  for (const asset of assets) counts.set(asset.deviceName, (counts.get(asset.deviceName) ?? 0) + 1);
  return [...counts].map(([name, count]) => (count > 1 ? `${name} ×${count}` : name)).join(" · ");
};

const userSelect = { select: { email: true, employee: { select: { fullName: true } } } } as const;

/** Semua penerimaan, terbaru dulu. Semua user Inventaris boleh melihat. */
export async function listGoodsReceipts(db: PrismaClient): Promise<GoodsReceiptRow[]> {
  const receipts = await db.goodsReceipt.findMany({
    orderBy: [{ receivedDate: "desc" }, { createdAt: "desc" }],
    include: {
      pic: { select: { fullName: true } },
      preparedBy: userSelect,
      assets: { select: { deviceName: true }, orderBy: { serialNo: "asc" } },
    },
  });
  return receipts.map((receipt) => ({
    id: receipt.id,
    hafNumber: receipt.hafNumber,
    ownership: receipt.ownership,
    ownerName: receipt.ownerName,
    contactName: receipt.contactName,
    receivedDate: toJakartaIsoDate(receipt.receivedDate),
    picName: receipt.pic.fullName,
    preparedByName: personName(receipt.preparedBy),
    unitCount: receipt.assets.length,
    unitSummary: summarize(receipt.assets),
  }));
}

export type GoodsReceiptUnit = {
  id: string;
  deviceName: string;
  serialNo: string;
  category: AssetCategory;
  location: string | null;
  notes: string | null;
  deleted: boolean;
};

export type GoodsReceiptDetail = Omit<GoodsReceiptRow, "unitSummary"> & {
  senderName: string | null;
  receiverName: string;
  purpose: string | null;
  createdAt: string;
  units: GoodsReceiptUnit[];
};

export async function getGoodsReceipt(db: PrismaClient, id: string): Promise<GoodsReceiptDetail | null> {
  const receipt = await db.goodsReceipt.findUnique({
    where: { id },
    include: {
      pic: { select: { fullName: true } },
      receiver: { select: { fullName: true } },
      preparedBy: userSelect,
      // Urutan baris saat dicatat (id cuid naik sesuai waktu dibuat).
      assets: { orderBy: { id: "asc" }, include: { rack: { select: { name: true } } } },
    },
  });
  if (!receipt) return null;
  return {
    id: receipt.id,
    hafNumber: receipt.hafNumber,
    ownership: receipt.ownership,
    ownerName: receipt.ownerName,
    contactName: receipt.contactName,
    receivedDate: toJakartaIsoDate(receipt.receivedDate),
    picName: receipt.pic.fullName,
    preparedByName: personName(receipt.preparedBy),
    unitCount: receipt.assets.length,
    senderName: receipt.senderName,
    receiverName: receipt.receiver.fullName,
    purpose: receipt.purpose,
    createdAt: receipt.createdAt.toISOString(),
    units: receipt.assets.map((asset) => ({
      id: asset.id,
      deviceName: asset.deviceName,
      serialNo: asset.serialNo,
      category: asset.category,
      location: rackLocationLabel(asset.rack?.name, asset.rackPosition),
      notes: asset.notes,
      deleted: Boolean(asset.deletedAt),
    })),
  };
}

export type GoodsReceiptFormOptions = {
  /** PIC dari AMI: karyawan aktif Engineer & Sales. */
  pics: SelectOption[];
  /** Penerima: semua karyawan aktif. */
  employees: SelectOption[];
  /** Nama principal / distributor yang pernah dipakai (saran isian, ejaan seragam). */
  owners: string[];
};

export async function getGoodsReceiptFormOptions(db: PrismaClient): Promise<GoodsReceiptFormOptions> {
  const [employees, owners] = await Promise.all([
    db.employee.findMany({ where: { status: "ACTIVE" }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, position: true, division: true } }),
    db.asset.findMany({ where: { ownerName: { not: null } }, distinct: ["ownerName"], select: { ownerName: true }, orderBy: { ownerName: "asc" } }),
  ]);
  const option = (employee: { id: string; fullName: string; position: string }) => ({ value: employee.id, label: `${employee.fullName} — ${employee.position}` });
  return {
    pics: employees.filter((employee) => INVENTORY_DIVISIONS.includes(employee.division)).map(option),
    employees: employees.map(option),
    owners: owners.map((row) => row.ownerName!).filter(Boolean),
  };
}
