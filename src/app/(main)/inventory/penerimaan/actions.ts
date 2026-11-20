"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { inventoryEnabled } from "@/lib/features";
import { receiveGoods, returnGoods } from "@/lib/services/goods-receipt";
import { goodsReceiptSchema, goodsReturnSchema } from "@/lib/validators/goods-receipt";

/**
 * Operational: catat penerimaan barang principal / distributor (2026-11-20) → unit terdaftar & HAF terbit. Hak akses
 * (hanya Operational), PIC, penerima, serial number & rak dicek ulang di service.
 */
export async function receiveGoodsAction(values: unknown): Promise<ActionResult<{ receiptId: string; hafNumber: string }>> {
  const user = await requireUser();
  if (!inventoryEnabled(user)) return { ok: false, error: "Modul Inventaris sedang ditunda." };
  try {
    const receipt = await receiveGoods(prisma, user, goodsReceiptSchema.parse(values));
    // Daftar Unit, Penerimaan Barang & detail unit ikut berubah.
    revalidatePath("/", "layout");
    return { ok: true, data: { receiptId: receipt.id, hafNumber: receipt.hafNumber } };
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Operational: kembalikan unit pinjaman ke principal / distributor (2026-11-20) → HAF pengembalian terbit, unit keluar
 * dari Daftar Unit. Hak akses, kepemilikan unit, unit yang masih dipakai & tanggal dicek ulang di service.
 */
export async function returnGoodsAction(receiptId: string, values: unknown): Promise<ActionResult<{ returnId: string; hafNumber: string }>> {
  const user = await requireUser();
  if (!inventoryEnabled(user)) return { ok: false, error: "Modul Inventaris sedang ditunda." };
  try {
    const goodsReturn = await returnGoods(prisma, user, z.string().min(1).max(64).parse(receiptId), goodsReturnSchema.parse(values));
    revalidatePath("/", "layout");
    return { ok: true, data: { returnId: goodsReturn.id, hafNumber: goodsReturn.hafNumber } };
  } catch (error) {
    return toActionError(error);
  }
}
