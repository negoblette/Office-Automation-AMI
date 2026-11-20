// Penerimaan barang principal / distributor (2026-11-20, keputusan user): barang yang dipinjam AMI dari principal /
// distributor wajib dicatat lewat penerimaan yang menerbitkan Hardware Admission Form (HAF mendata semua barang masuk).
// - Hanya Operational (Admin tidak otomatis). Satu kedatangan = satu HAF, boleh banyak unit.
// - Unit-unitnya langsung terdaftar di Daftar Unit dengan kepemilikan principal / distributor + `receiptId`; unit milik
//   AMI tetap lewat Tambah Unit biasa (tanpa HAF), dan kepemilikan tidak bisa diubah lewat Ubah Unit.
// - Nomor `NNN/AMI-HAF/<nama pemilik>/<tahun>` dari counter HAF yang sama dengan pengambilan peminjaman.
// - Selama di AMI, unit titipan dipinjamkan ke customer atas nama AMI (milik AMI untuk sementara, 2026-11-20); keluar
//   lagi lewat Pengembalian (`returnGoods`, HAF baru). Serial yang sama diterima lagi → baris Asset lama dipakai lagi.
import { type Asset, Prisma, type PrismaClient } from "@/generated/prisma/client";
import { fromIsoDate, toJakartaIsoDate } from "@/lib/format";
import type { GoodsReceiptInput, GoodsReturnInput } from "@/lib/validators/goods-receipt";
import { assertSerialAvailable } from "./asset";
import { logAudit } from "./audit";
import type { LoanActor } from "./demo-loan";
import { heldLoanItemWhere } from "./demo-loan-hold";
import { ServiceError } from "./errors";
import { assertInventoryPic, assertOperational } from "./inventory-access";
import { nextHafNumber } from "./numbering";
import { assertRackPosition } from "./storage-rack";

type Tx = Prisma.TransactionClient;

/** Pesan rak / posisi / serial number ditempel ke baris unit yang salah (`units.<i>.<field>`). */
async function onRow<T>(index: number, check: () => Promise<T>): Promise<T> {
  try {
    return await check();
  } catch (error) {
    if (error instanceof ServiceError && error.field) throw new ServiceError(error.message, `units.${index}.${error.field}`);
    throw error;
  }
}

/** Catat penerimaan barang & daftarkan unitnya. HAF langsung bisa dicetak. */
export async function receiveGoods(db: PrismaClient, actor: LoanActor, input: GoodsReceiptInput, today = toJakartaIsoDate()) {
  return db.$transaction(async (tx: Tx) => {
    await assertOperational(tx, actor, "Hanya Operational yang bisa mencatat penerimaan barang. Operational ditunjuk Admin di Setting → Inventaris & Rak.");
    if (input.receivedDate > today) throw new ServiceError("Tanggal terima tidak boleh di masa depan", "receivedDate");
    await assertInventoryPic(tx, input.picId);
    const receiver = await tx.employee.findUnique({ where: { id: input.receiverId }, select: { status: true } });
    if (receiver?.status !== "ACTIVE") throw new ServiceError("Penerima harus karyawan aktif", "receiverId");
    // Unit yang pernah dikembalikan ke principal / distributor lalu dipinjam AMI lagi: baris Asset yang sama dipakai lagi
    // (serial number unik, riwayatnya menyambung) — bukan ditolak sebagai serial yang sudah terpakai.
    const returnedBefore = new Map<number, Asset>();
    for (const [index, unit] of input.units.entries()) {
      const existing = await tx.asset.findUnique({ where: { serialNo: unit.serialNo } });
      if (existing?.returnedToOwnerAt) returnedBefore.set(index, existing);
      else await onRow(index, () => assertSerialAvailable(tx, unit.serialNo));
      await onRow(index, () => assertRackPosition(tx, unit.rackId, unit.rackPosition));
    }

    const receipt = await tx.goodsReceipt.create({
      data: {
        hafNumber: await nextHafNumber(tx, input.ownerName, fromIsoDate(today)),
        ownership: input.ownership,
        ownerName: input.ownerName,
        contactName: input.contactName,
        receivedDate: fromIsoDate(input.receivedDate),
        picId: input.picId,
        senderName: input.senderName,
        receiverId: input.receiverId,
        purpose: input.purpose,
        preparedById: actor.id,
      },
    });
    const assets = [];
    for (const [index, unit] of input.units.entries()) {
      const data = {
        deviceName: unit.deviceName,
        serialNo: unit.serialNo,
        category: unit.category,
        notes: unit.notes,
        rackId: unit.rackId,
        rackPosition: unit.rackId ? unit.rackPosition : null,
        ownership: input.ownership,
        ownerName: input.ownerName,
        receiptId: receipt.id,
      };
      const previous = returnedBefore.get(index);
      if (previous) {
        const asset = await tx.asset.update({ where: { id: previous.id }, data: { ...data, deletedAt: null, returnedToOwnerAt: null } });
        await logAudit(tx, { actorId: actor.id, action: "UPDATE", entity: "Asset", entityId: asset.id, before: previous, after: asset });
        assets.push(asset);
      } else {
        const asset = await tx.asset.create({ data });
        await logAudit(tx, { actorId: actor.id, action: "CREATE", entity: "Asset", entityId: asset.id, after: asset });
        assets.push(asset);
      }
    }
    await logAudit(tx, {
      actorId: actor.id,
      action: "CREATE",
      entity: "GoodsReceipt",
      entityId: receipt.id,
      after: { ...receipt, units: assets.map((asset) => ({ assetId: asset.id, deviceName: asset.deviceName, serialNo: asset.serialNo })) },
    });
    return receipt;
  });
}

/**
 * Kembalikan barang pinjaman ke principal / distributor (2026-11-20, keputusan user: per unit, boleh sebagian; pakai
 * Hardware Admission Form). Hanya Operational. Unit harus milik penerimaan ini, masih di AMI, tidak sedang ada di
 * peminjaman aktif / tindak lanjut, dan tidak sedang diserahkan ke karyawan. Nomor HAF terbit dari counter HAF yang sama;
 * unit keluar dari inventaris (`returnedToOwnerAt` + `deletedAt`, rak dikosongkan). Audit memuat nomor HAF (Riwayat Unit).
 */
export async function returnGoods(db: PrismaClient, actor: LoanActor, receiptId: string, input: GoodsReturnInput, today = toJakartaIsoDate()) {
  return db.$transaction(async (tx: Tx) => {
    await assertOperational(tx, actor, "Hanya Operational yang bisa mencatat pengembalian barang. Operational ditunjuk Admin di Setting → Inventaris & Rak.");
    const receipt = await tx.goodsReceipt.findUnique({ where: { id: receiptId } });
    if (!receipt) throw new ServiceError("Penerimaan barang tidak ditemukan");
    if (input.returnedDate > today) throw new ServiceError("Tanggal pengembalian tidak boleh di masa depan", "returnedDate");
    if (input.returnedDate < toJakartaIsoDate(receipt.receivedDate)) {
      throw new ServiceError(`Tanggal pengembalian tidak boleh sebelum tanggal terima (${toJakartaIsoDate(receipt.receivedDate)})`, "returnedDate");
    }
    const returner = await tx.employee.findUnique({ where: { id: input.returnedById }, select: { status: true } });
    if (returner?.status !== "ACTIVE") throw new ServiceError("Yang menyerahkan harus karyawan aktif", "returnedById");

    // Dikunci: pengajuan pinjam / serah terima bersamaan menunggu, jadi unit tidak keluar di tengah prosesnya.
    await tx.$queryRaw`SELECT id FROM "Asset" WHERE id IN (${Prisma.join([...input.assetIds].sort())}) ORDER BY id FOR UPDATE`;
    const units = await tx.asset.findMany({ where: { id: { in: input.assetIds }, receiptId: receipt.id, deletedAt: null } });
    if (units.length !== input.assetIds.length) {
      throw new ServiceError("Ada unit yang bukan dari penerimaan ini atau sudah dikembalikan / dihapus. Muat ulang halaman lalu pilih lagi.", "assetIds");
    }
    const [held, assigned] = await Promise.all([
      tx.demoLoanItem.findMany({ where: { assetId: { in: input.assetIds }, ...heldLoanItemWhere() }, select: { asset: { select: { deviceName: true, serialNo: true } } } }),
      tx.assetAssignment.findMany({ where: { assetId: { in: input.assetIds }, returnedAt: null }, select: { asset: { select: { deviceName: true, serialNo: true } } } }),
    ]);
    const busy = [...held, ...assigned].map(({ asset }) => `${asset.deviceName} (SN ${asset.serialNo})`);
    if (busy.length) {
      throw new ServiceError(`Unit masih dipakai (diajukan / dipinjam / ditindaklanjuti / diserahkan ke karyawan): ${[...new Set(busy)].join(", ")}`, "assetIds");
    }

    const byId = new Map(units.map((unit) => [unit.id, unit]));
    const ordered = input.assetIds.map((id) => byId.get(id)!);
    const goodsReturn = await tx.goodsReturn.create({
      data: {
        hafNumber: await nextHafNumber(tx, receipt.ownerName, fromIsoDate(today)),
        receiptId: receipt.id,
        returnedDate: fromIsoDate(input.returnedDate),
        contactName: input.contactName,
        returnedById: input.returnedById,
        receivedByName: input.receivedByName,
        note: input.note,
        preparedById: actor.id,
        items: { create: ordered.map((unit) => ({ assetId: unit.id, deviceName: unit.deviceName, serialNo: unit.serialNo })) },
      },
    });
    const now = new Date();
    for (const unit of ordered) {
      const after = await tx.asset.update({ where: { id: unit.id }, data: { returnedToOwnerAt: now, deletedAt: now, rackId: null, rackPosition: null } });
      await logAudit(tx, { actorId: actor.id, action: "UPDATE", entity: "Asset", entityId: unit.id, before: unit, after: { ...after, returnHafNumber: goodsReturn.hafNumber } });
    }
    await logAudit(tx, {
      actorId: actor.id,
      action: "CREATE",
      entity: "GoodsReturn",
      entityId: goodsReturn.id,
      after: { ...goodsReturn, units: ordered.map((unit) => ({ assetId: unit.id, deviceName: unit.deviceName, serialNo: unit.serialNo })) },
    });
    return goodsReturn;
  });
}
