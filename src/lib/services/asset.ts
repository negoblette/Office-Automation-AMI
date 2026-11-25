// Inventory / demo unit — URD INV-01..03. Dikelola Admin & Operational (2026-11-17). Serah terima ke karyawan
// (assignAsset/returnAsset, AssetAssignment) tidak dipakai lagi sejak 2026-11-17 — tidak ada aksi/tampilannya; fungsi
// & data lama dibiarkan untuk riwayat. Unit dipinjamkan ke perusahaan lain lewat Product Trial Form (Fase 16).
// Kepemilikan (2026-11-20): unit yang didaftarkan di sini selalu milik AMI dan Ubah Unit tidak mengubah kepemilikan —
// unit principal / distributor hanya masuk lewat Penerimaan Barang (services/goods-receipt.ts, menerbitkan HAF).
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { formatDate, fromIsoDate, toJakartaIsoDate } from "@/lib/format";
import type { AssetBatchInput, AssetInput, AssignAssetInput, ReturnAssetInput } from "@/lib/validators/asset";
import { logAudit } from "./audit";
import { onRow, ServiceError } from "./errors";
import { assertRackPosition } from "./storage-rack";

type Tx = Prisma.TransactionClient;

/** Isian form unit. Support / warranty & kepemilikan tidak lewat form ini (2026-11-20) — nilai lama tidak diubah. */
function assetData(input: AssetInput) {
  return {
    deviceName: input.deviceName,
    serialNo: input.serialNo,
    category: input.category,
    notes: input.notes,
    rackId: input.rackId,
    rackPosition: input.rackId ? input.rackPosition : null,
  };
}

/**
 * Serial number belum dipakai unit lain (termasuk yang sudah dihapus). Kosong = lolos: serial number boleh kosong sejak
 * 2026-11-25 dan banyak unit boleh sama-sama tanpa S/N. `field` = kolom form untuk pesan error.
 */
export async function assertSerialAvailable(tx: Tx, serialNo: string | null, exceptId?: string, field = "serialNo") {
  if (!serialNo) return;
  const existing = await tx.asset.findUnique({ where: { serialNo }, select: { id: true, deletedAt: true } });
  if (existing && existing.id !== exceptId) {
    throw new ServiceError(existing.deletedAt ? "Serial number pernah dipakai aset yang sudah dihapus" : "Serial number sudah terdaftar", field);
  }
}

async function openAssignment(tx: Tx, assetId: string) {
  return tx.assetAssignment.findFirst({ where: { assetId, returnedAt: null }, include: { employee: { select: { fullName: true } } } });
}

/** Unit baru milik AMI + audit. Serial number & rak sudah dicek pemanggil. */
async function insertAsset(tx: Tx, actorId: string, input: AssetInput) {
  const asset = await tx.asset.create({ data: { ...assetData(input), ownership: "AMI", ownerName: null } });
  await logAudit(tx, { actorId, action: "CREATE", entity: "Asset", entityId: asset.id, after: asset });
  return asset;
}

export async function createAsset(db: PrismaClient, actorId: string, input: AssetInput) {
  return db.$transaction(async (tx) => {
    await assertSerialAvailable(tx, input.serialNo);
    await assertRackPosition(tx, input.rackId, input.rackPosition);
    return insertAsset(tx, actorId, input);
  });
}

/**
 * Daftarkan Unit berbaris (2026-11-25, permintaan user): beberapa unit milik AMI sekaligus dalam satu transaksi — satu
 * baris gagal (serial sudah terdaftar, posisi rak salah) → tidak ada yang tersimpan, pesannya di baris itu (`units.<i>.…`).
 */
export async function createAssets(db: PrismaClient, actorId: string, input: AssetBatchInput) {
  return db.$transaction(async (tx) => {
    for (const [index, unit] of input.units.entries()) {
      await onRow(`units.${index}`, () => assertSerialAvailable(tx, unit.serialNo));
      await onRow(`units.${index}`, () => assertRackPosition(tx, unit.rackId, unit.rackPosition));
    }
    const assets = [];
    for (const unit of input.units) assets.push(await insertAsset(tx, actorId, unit));
    return assets;
  });
}

export async function updateAsset(db: PrismaClient, actorId: string, assetId: string, input: AssetInput) {
  return db.$transaction(async (tx) => {
    const before = await tx.asset.findUnique({ where: { id: assetId, deletedAt: null } });
    if (!before) throw new ServiceError("Aset tidak ditemukan");
    await assertSerialAvailable(tx, input.serialNo, assetId);
    await assertRackPosition(tx, input.rackId, input.rackPosition);
    const after = await tx.asset.update({ where: { id: assetId }, data: assetData(input) });
    await logAudit(tx, { actorId, action: "UPDATE", entity: "Asset", entityId: assetId, before, after });
    return after;
  });
}

/** Hapus aset — hanya jika belum pernah diserahterimakan / diajukan pinjam (riwayat tidak boleh hilang). */
export async function deleteAsset(db: PrismaClient, actorId: string, assetId: string) {
  return db.$transaction(async (tx) => {
    // Dikunci: pengajuan peminjaman yang sedang berjalan menunggu, jadi unit tidak terhapus di tengah pengajuan.
    await tx.$queryRaw`SELECT id FROM "Asset" WHERE id = ${assetId} FOR UPDATE`;
    const asset = await tx.asset.findUnique({ where: { id: assetId }, include: { _count: { select: { assignments: true, loanItems: true } } } });
    if (!asset || asset.deletedAt) throw new ServiceError("Aset tidak ditemukan");
    if (asset._count.assignments > 0) throw new ServiceError("Aset yang sudah punya riwayat serah terima tidak bisa dihapus");
    if (asset._count.loanItems > 0) throw new ServiceError("Unit yang pernah diajukan pinjam tidak bisa dihapus — riwayat peminjamannya tetap disimpan");
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
