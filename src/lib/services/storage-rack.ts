// Rak penyimpanan unit Inventory (2026-11-17), diatur Admin di Setting → Inventaris & Rak.
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { isPositionInRack } from "@/lib/inventory";
import type { RackInput } from "@/lib/validators/inventory";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";

type Tx = Prisma.TransactionClient;

export type RackView = { id: string; name: string; columns: number; rows: number; note: string | null; assetCount: number };

/** Rak aktif, urut nama alami ("Rak 2" sebelum "Rak 10"), dengan jumlah unit di dalamnya. */
export async function listRacks(db: PrismaClient | Tx): Promise<RackView[]> {
  const racks = await db.storageRack.findMany({
    where: { deletedAt: null },
    include: { _count: { select: { assets: { where: { deletedAt: null } } } } },
  });
  return racks
    .map((rack) => ({ id: rack.id, name: rack.name, columns: rack.columns, rows: rack.rows, note: rack.note, assetCount: rack._count.assets }))
    .sort((a, b) => a.name.localeCompare(b.name, "id", { numeric: true }));
}

/** Nama rak dipakai rak lain (tanpa beda huruf besar/kecil). */
async function sameName(tx: Tx, name: string, exceptId?: string) {
  return tx.storageRack.findFirst({ where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) } });
}

/** Unit aktif yang posisinya berada di luar ukuran rak baru. */
async function assetsOutside(tx: Tx, rackId: string, size: { columns: number; rows: number }) {
  const assets = await tx.asset.findMany({ where: { rackId, deletedAt: null }, select: { rackPosition: true } });
  return assets.filter((asset) => asset.rackPosition && !isPositionInRack(asset.rackPosition, size)).map((asset) => asset.rackPosition!);
}

/** Tambah rak. Nama rak yang pernah dihapus dipulihkan dengan ukuran baru. */
export async function createRack(db: PrismaClient, actorId: string, input: RackInput) {
  return db.$transaction(async (tx) => {
    const existing = await sameName(tx, input.name);
    if (existing && !existing.deletedAt) throw new ServiceError("Nama rak sudah dipakai", "name");
    const data = { name: input.name, columns: input.columns, rows: input.rows, note: input.note };
    const rack = existing
      ? await tx.storageRack.update({ where: { id: existing.id }, data: { ...data, deletedAt: null } })
      : await tx.storageRack.create({ data });
    // Memulihkan rak yang pernah dihapus = UPDATE baris lama (before berisi deletedAt).
    await logAudit(tx, { actorId, action: existing ? "UPDATE" : "CREATE", entity: "StorageRack", entityId: rack.id, before: existing, after: rack });
    return rack;
  });
}

/** Ubah rak. Ukuran tidak boleh diperkecil kalau ada unit di posisi yang akan hilang. */
export async function updateRack(db: PrismaClient, actorId: string, rackId: string, input: RackInput) {
  return db.$transaction(async (tx) => {
    const before = await tx.storageRack.findUnique({ where: { id: rackId, deletedAt: null } });
    if (!before) throw new ServiceError("Rak tidak ditemukan");
    if (await sameName(tx, input.name, rackId)) throw new ServiceError("Nama rak sudah dipakai", "name");
    const outside = await assetsOutside(tx, rackId, input);
    if (outside.length) {
      const positions = [...new Set(outside)].sort().join(", ");
      throw new ServiceError(`Masih ada unit di posisi ${positions}. Pindahkan dulu sebelum memperkecil rak.`, "rows");
    }
    const after = await tx.storageRack.update({ where: { id: rackId }, data: { name: input.name, columns: input.columns, rows: input.rows, note: input.note } });
    await logAudit(tx, { actorId, action: "UPDATE", entity: "StorageRack", entityId: rackId, before, after });
    return after;
  });
}

/** Hapus rak (soft delete) — hanya rak kosong. */
export async function deleteRack(db: PrismaClient, actorId: string, rackId: string) {
  return db.$transaction(async (tx) => {
    const rack = await tx.storageRack.findUnique({ where: { id: rackId, deletedAt: null } });
    if (!rack) throw new ServiceError("Rak tidak ditemukan");
    const count = await tx.asset.count({ where: { rackId, deletedAt: null } });
    if (count) throw new ServiceError(`Rak masih berisi ${count} unit. Pindahkan dulu ke rak lain.`);
    await tx.storageRack.update({ where: { id: rackId }, data: { deletedAt: new Date() } });
    await logAudit(tx, { actorId, action: "DELETE", entity: "StorageRack", entityId: rackId, before: rack });
  });
}

/** Rak aktif & posisinya ada di dalam rak (dipakai saat menyimpan unit). */
export async function assertRackPosition(tx: Tx, rackId: string | null, position: string | null) {
  if (!rackId) return;
  const rack = await tx.storageRack.findUnique({ where: { id: rackId, deletedAt: null } });
  if (!rack) throw new ServiceError("Rak tidak ditemukan", "rackId");
  if (!position || !isPositionInRack(position, rack)) throw new ServiceError(`Posisi tidak ada di ${rack.name}`, "rackPosition");
}
