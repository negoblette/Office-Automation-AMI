// Penerimaan barang principal / distributor (2026-11-20, keputusan user): barang yang dipinjam AMI dari principal /
// distributor wajib dicatat lewat penerimaan yang menerbitkan Hardware Admission Form (HAF mendata semua barang masuk).
// - Hanya Operational (Admin tidak otomatis). Satu kedatangan = satu HAF, boleh banyak unit.
// - Unit-unitnya langsung terdaftar di Daftar Unit dengan kepemilikan principal / distributor + `receiptId`; unit milik
//   AMI tetap lewat Tambah Unit biasa (tanpa HAF), dan kepemilikan tidak bisa diubah lewat Ubah Unit.
// - Nomor `NNN/AMI-HAF/<nama pemilik>/<tahun>` dari counter HAF yang sama dengan pengambilan peminjaman.
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { fromIsoDate, toJakartaIsoDate } from "@/lib/format";
import type { GoodsReceiptInput } from "@/lib/validators/goods-receipt";
import { assertSerialAvailable } from "./asset";
import { logAudit } from "./audit";
import type { LoanActor } from "./demo-loan";
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
    for (const [index, unit] of input.units.entries()) {
      await onRow(index, () => assertSerialAvailable(tx, unit.serialNo));
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
    for (const unit of input.units) {
      const asset = await tx.asset.create({
        data: {
          deviceName: unit.deviceName,
          serialNo: unit.serialNo,
          category: unit.category,
          notes: unit.notes,
          rackId: unit.rackId,
          rackPosition: unit.rackId ? unit.rackPosition : null,
          ownership: input.ownership,
          ownerName: input.ownerName,
          receiptId: receipt.id,
        },
      });
      await logAudit(tx, { actorId: actor.id, action: "CREATE", entity: "Asset", entityId: asset.id, after: asset });
      assets.push(asset);
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
