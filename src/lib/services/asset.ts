// Inventory / demo unit — URD INV-01..03. Dikelola Admin; riwayat serah terima di AssetAssignment.
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { formatDate, fromIsoDate, toJakartaIsoDate } from "@/lib/format";
import type { AssetInput, AssignAssetInput, ReturnAssetInput } from "@/lib/validators/asset";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";

type Tx = Prisma.TransactionClient;

function assetData(input: AssetInput) {
  const date = (iso: string | null) => (iso ? fromIsoDate(iso) : null);
  return {
    deviceName: input.deviceName,
    serialNo: input.serialNo,
    category: input.category,
    supportStart: date(input.supportStart),
    supportEnd: date(input.supportEnd),
    warrantyStart: date(input.warrantyStart),
    warrantyEnd: date(input.warrantyEnd),
    warrantyNote: input.warrantyNote,
    notes: input.notes,
  };
}

async function assertSerialAvailable(tx: Tx, serialNo: string, exceptId?: string) {
  const existing = await tx.asset.findUnique({ where: { serialNo }, select: { id: true, deletedAt: true } });
  if (existing && existing.id !== exceptId) {
    throw new ServiceError(existing.deletedAt ? "Serial number pernah dipakai aset yang sudah dihapus" : "Serial number sudah terdaftar", "serialNo");
  }
}

async function openAssignment(tx: Tx, assetId: string) {
  return tx.assetAssignment.findFirst({ where: { assetId, returnedAt: null }, include: { employee: { select: { fullName: true } } } });
}

export async function createAsset(db: PrismaClient, actorId: string, input: AssetInput) {
  return db.$transaction(async (tx) => {
    await assertSerialAvailable(tx, input.serialNo);
    const asset = await tx.asset.create({ data: assetData(input) });
    await logAudit(tx, { actorId, action: "CREATE", entity: "Asset", entityId: asset.id, after: asset });
    return asset;
  });
}

export async function updateAsset(db: PrismaClient, actorId: string, assetId: string, input: AssetInput) {
  return db.$transaction(async (tx) => {
    const before = await tx.asset.findUnique({ where: { id: assetId, deletedAt: null } });
    if (!before) throw new ServiceError("Aset tidak ditemukan");
    await assertSerialAvailable(tx, input.serialNo, assetId);
    const after = await tx.asset.update({ where: { id: assetId }, data: assetData(input) });
    await logAudit(tx, { actorId, action: "UPDATE", entity: "Asset", entityId: assetId, before, after });
    return after;
  });
}

/** Hapus aset — hanya jika belum pernah diserahterimakan (riwayat tidak boleh hilang). */
export async function deleteAsset(db: PrismaClient, actorId: string, assetId: string) {
  return db.$transaction(async (tx) => {
    const asset = await tx.asset.findUnique({ where: { id: assetId }, include: { _count: { select: { assignments: true } } } });
    if (!asset || asset.deletedAt) throw new ServiceError("Aset tidak ditemukan");
    if (asset._count.assignments > 0) throw new ServiceError("Aset yang sudah punya riwayat serah terima tidak bisa dihapus");
    await tx.asset.update({ where: { id: assetId }, data: { deletedAt: new Date() } }); // soft delete (NFR v1.14)
    await logAudit(tx, { actorId, action: "DELETE", entity: "Asset", entityId: assetId, before: asset });
  });
}

/** Serahkan aset ke karyawan aktif (INV-02). Aset harus sedang tidak dipinjam. */
export async function assignAsset(db: PrismaClient, actorId: string, assetId: string, input: AssignAssetInput) {
  return db.$transaction(async (tx) => {
    const asset = await tx.asset.findUnique({ where: { id: assetId, deletedAt: null } });
    if (!asset) throw new ServiceError("Aset tidak ditemukan");
    // Kunci baris aset: dua serah terima bersamaan tidak boleh sama-sama lolos.
    await tx.$queryRaw`SELECT id FROM "Asset" WHERE id = ${assetId} FOR UPDATE`;
    const current = await openAssignment(tx, assetId);
    if (current) throw new ServiceError(`Aset masih dipegang ${current.employee.fullName}. Kembalikan dulu.`);

    const employee = await tx.employee.findUnique({ where: { id: input.employeeId }, select: { status: true } });
    if (employee?.status !== "ACTIVE") throw new ServiceError("Hanya bisa diserahkan ke karyawan aktif", "employeeId");

    const last = await tx.assetAssignment.findFirst({ where: { assetId }, orderBy: { assignedAt: "desc" } });
    if (last?.returnedAt && input.assignedAt < toJakartaIsoDate(last.returnedAt)) {
      throw new ServiceError(`Tanggal serah tidak boleh sebelum pengembalian terakhir (${formatDate(last.returnedAt)})`, "assignedAt");
    }

    const assignment = await tx.assetAssignment.create({
      data: { assetId, employeeId: input.employeeId, assignedAt: fromIsoDate(input.assignedAt), note: input.note },
    });
    await logAudit(tx, { actorId, action: "CREATE", entity: "AssetAssignment", entityId: assignment.id, after: assignment });
    return assignment;
  });
}

/** Catat pengembalian aset (INV-02). */
export async function returnAsset(db: PrismaClient, actorId: string, assetId: string, input: ReturnAssetInput) {
  return db.$transaction(async (tx) => {
    const current = await openAssignment(tx, assetId);
    if (!current) throw new ServiceError("Aset sedang tidak dipinjam");
    if (input.returnedAt < toJakartaIsoDate(current.assignedAt)) {
      throw new ServiceError(`Tanggal kembali tidak boleh sebelum tanggal serah (${formatDate(current.assignedAt)})`, "returnedAt");
    }
    const note = [current.note, input.note && `Kembali: ${input.note}`].filter(Boolean).join(" · ") || null;
    const after = await tx.assetAssignment.update({
      where: { id: current.id },
      data: { returnedAt: fromIsoDate(input.returnedAt), note },
    });
    await logAudit(tx, { actorId, action: "UPDATE", entity: "AssetAssignment", entityId: current.id, before: current, after });
    return after;
  });
}
