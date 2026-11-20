// Query halaman Penerimaan Barang (2026-11-20). Tanggal sebagai ISO string (aman ke client).
import type { AssetCategory, AssetOwnership, Prisma, PrismaClient } from "@/generated/prisma/client";
import type { SelectOption } from "@/components/form/select-field";
import { DEMO_LOAN_STATUS_LABEL } from "@/lib/demo-loan";
import { toJakartaIsoDate } from "@/lib/format";
import { INVENTORY_DIVISIONS, rackLocationLabel } from "@/lib/inventory";
import { heldLoanItemWhere } from "./demo-loan-hold";

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
  /** Unit yang sudah dikembalikan ke principal / distributor (2026-11-20). */
  returnedCount: number;
  /** "Switch 24 port ×2 · SFP+ (10G)" */
  unitSummary: string;
};

/** Semua unit penerimaan: yang masih tertaut + yang sudah dikembalikan (unitnya bisa sudah pindah ke penerimaan lain). */
function receiptUnitIds(receipt: { assets: { id: string }[]; returns: { items: { assetId: string }[] }[] }) {
  const returned = new Set(receipt.returns.flatMap((goodsReturn) => goodsReturn.items.map((item) => item.assetId)));
  return { total: new Set([...receipt.assets.map((asset) => asset.id), ...returned]).size, returned: returned.size };
}

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
      assets: { select: { id: true, deviceName: true }, orderBy: { serialNo: "asc" } },
      returns: { select: { items: { select: { assetId: true, deviceName: true } } } },
    },
  });
  return receipts.map((receipt) => {
    const counts = receiptUnitIds(receipt);
    const linked = new Set(receipt.assets.map((asset) => asset.id));
    const moved = receipt.returns.flatMap((goodsReturn) => goodsReturn.items).filter((item) => !linked.has(item.assetId));
    return {
      id: receipt.id,
      hafNumber: receipt.hafNumber,
      ownership: receipt.ownership,
      ownerName: receipt.ownerName,
      contactName: receipt.contactName,
      receivedDate: toJakartaIsoDate(receipt.receivedDate),
      picName: receipt.pic.fullName,
      preparedByName: personName(receipt.preparedBy),
      unitCount: counts.total,
      returnedCount: counts.returned,
      unitSummary: summarize([...receipt.assets, ...moved]),
    };
  });
}

/**
 * Status unit penerimaan (2026-11-20): AVAILABLE = di AMI & bisa dikembalikan; BUSY = sedang diajukan / dipinjam /
 * ditindaklanjuti / diserahkan ke karyawan (belum bisa dikembalikan); RETURNED = sudah dikembalikan; DELETED = dihapus.
 */
export type GoodsReceiptUnitStatus =
  | { kind: "AVAILABLE" }
  | { kind: "BUSY"; label: string }
  | { kind: "RETURNED"; date: string; hafNumber: string; returnId: string }
  | { kind: "DELETED" };

export type GoodsReceiptUnit = {
  id: string;
  deviceName: string;
  serialNo: string;
  category: AssetCategory | null;
  location: string | null;
  notes: string | null;
  status: GoodsReceiptUnitStatus;
};

export type GoodsReturnView = {
  id: string;
  hafNumber: string;
  returnedDate: string;
  contactName: string;
  returnedByName: string;
  receivedByName: string | null;
  note: string | null;
  preparedByName: string;
  createdAt: string;
  units: { assetId: string; deviceName: string; serialNo: string }[];
};

export type GoodsReceiptDetail = Omit<GoodsReceiptRow, "unitSummary"> & {
  senderName: string | null;
  receiverName: string;
  purpose: string | null;
  createdAt: string;
  units: GoodsReceiptUnit[];
  /** Pengembalian ke principal / distributor, terbaru dulu. */
  returns: GoodsReturnView[];
};

const returnInclude = {
  returnedBy: { select: { fullName: true } },
  preparedBy: userSelect,
  items: { orderBy: { id: "asc" as const } },
} as const;

export async function getGoodsReceipt(db: PrismaClient, id: string): Promise<GoodsReceiptDetail | null> {
  const receipt = await db.goodsReceipt.findUnique({
    where: { id },
    include: {
      pic: { select: { fullName: true } },
      receiver: { select: { fullName: true } },
      preparedBy: userSelect,
      // Urutan baris saat dicatat (id cuid naik sesuai waktu dibuat).
      assets: {
        orderBy: { id: "asc" },
        include: {
          rack: { select: { name: true } },
          loanItems: { where: heldLoanItemWhere(), select: { loan: { select: { status: true, borrowerName: true } } }, take: 1 },
          assignments: { where: { returnedAt: null }, select: { employee: { select: { fullName: true } } }, take: 1 },
        },
      },
      returns: { orderBy: [{ returnedDate: "desc" }, { createdAt: "desc" }], include: returnInclude },
    },
  });
  if (!receipt) return null;
  const returns = receipt.returns.map(toReturnView);
  const returnOf = new Map(returns.flatMap((goodsReturn) => goodsReturn.units.map((unit) => [unit.assetId, goodsReturn] as const)));
  const linked = new Set(receipt.assets.map((asset) => asset.id));
  const units: GoodsReceiptUnit[] = receipt.assets.map((asset) => {
    const busyLoan = asset.loanItems[0]?.loan;
    const assignee = asset.assignments[0]?.employee.fullName;
    const goodsReturn = returnOf.get(asset.id);
    const status: GoodsReceiptUnitStatus =
      asset.returnedToOwnerAt && goodsReturn
        ? { kind: "RETURNED", date: goodsReturn.returnedDate, hafNumber: goodsReturn.hafNumber, returnId: goodsReturn.id }
        : asset.deletedAt
          ? { kind: "DELETED" }
          : busyLoan
            ? { kind: "BUSY", label: `${DEMO_LOAN_STATUS_LABEL[busyLoan.status]} · ${busyLoan.borrowerName}` }
            : assignee
              ? { kind: "BUSY", label: `Diserahkan ke ${assignee}` }
              : { kind: "AVAILABLE" };
    return {
      id: asset.id,
      deviceName: asset.deviceName,
      serialNo: asset.serialNo,
      category: asset.category,
      location: rackLocationLabel(asset.rack?.name, asset.rackPosition),
      notes: asset.notes,
      status,
    };
  });
  // Unit yang dikembalikan lalu diterima lagi lewat penerimaan lain: tetap tercatat di sini sebagai sudah dikembalikan.
  for (const goodsReturn of returns) {
    for (const unit of goodsReturn.units.filter((item) => !linked.has(item.assetId))) {
      units.push({
        id: unit.assetId,
        deviceName: unit.deviceName,
        serialNo: unit.serialNo,
        category: null,
        location: null,
        notes: null,
        status: { kind: "RETURNED", date: goodsReturn.returnedDate, hafNumber: goodsReturn.hafNumber, returnId: goodsReturn.id },
      });
    }
  }
  return {
    id: receipt.id,
    hafNumber: receipt.hafNumber,
    ownership: receipt.ownership,
    ownerName: receipt.ownerName,
    contactName: receipt.contactName,
    receivedDate: toJakartaIsoDate(receipt.receivedDate),
    picName: receipt.pic.fullName,
    preparedByName: personName(receipt.preparedBy),
    unitCount: units.length,
    returnedCount: units.filter((unit) => unit.status.kind === "RETURNED").length,
    senderName: receipt.senderName,
    receiverName: receipt.receiver.fullName,
    purpose: receipt.purpose,
    createdAt: receipt.createdAt.toISOString(),
    units,
    returns,
  };
}

function toReturnView(goodsReturn: Prisma.GoodsReturnGetPayload<{ include: typeof returnInclude }>): GoodsReturnView {
  return {
    id: goodsReturn.id,
    hafNumber: goodsReturn.hafNumber,
    returnedDate: toJakartaIsoDate(goodsReturn.returnedDate),
    contactName: goodsReturn.contactName,
    returnedByName: goodsReturn.returnedBy.fullName,
    receivedByName: goodsReturn.receivedByName,
    note: goodsReturn.note,
    preparedByName: personName(goodsReturn.preparedBy),
    createdAt: goodsReturn.createdAt.toISOString(),
    units: goodsReturn.items.map((item) => ({ assetId: item.assetId, deviceName: item.deviceName, serialNo: item.serialNo })),
  };
}

/** Satu pengembalian + penerimaannya (halaman cetak HAF pengembalian). */
export async function getGoodsReturn(db: PrismaClient, id: string) {
  const goodsReturn = await db.goodsReturn.findUnique({
    where: { id },
    include: { ...returnInclude, receipt: { include: { pic: { select: { fullName: true } } } } },
  });
  if (!goodsReturn) return null;
  return {
    ...toReturnView(goodsReturn),
    receipt: {
      id: goodsReturn.receipt.id,
      hafNumber: goodsReturn.receipt.hafNumber,
      ownership: goodsReturn.receipt.ownership,
      ownerName: goodsReturn.receipt.ownerName,
      picName: goodsReturn.receipt.pic.fullName,
    },
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
