"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, toActionError } from "@/lib/actions";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { FEATURES } from "@/lib/features";
import { assignAsset, createAsset, deleteAsset, returnAsset, updateAsset } from "@/lib/services/asset";
import { assetSchema, assignAssetSchema, returnAssetSchema } from "@/lib/validators/asset";

function revalidateInventory() {
  revalidatePath("/inventory", "layout");
  revalidatePath("/karyawan", "layout");
  revalidatePath("/profil/inventory");
}

async function run(action: () => Promise<unknown>): Promise<ActionResult> {
  if (!FEATURES.inventory) return { ok: false, error: "Modul Inventory sedang ditunda." };
  try {
    await action();
    revalidateInventory();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

const id = (value: string) => z.string().min(1).parse(value);

/** Daftarkan atau ubah aset (INV-01, Admin). `assetId` null = baru. */
export async function saveAssetAction(assetId: string | null, values: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  return run(() => {
    const input = assetSchema.parse(values);
    return assetId ? updateAsset(prisma, admin.id, id(assetId), input) : createAsset(prisma, admin.id, input);
  });
}

export async function deleteAssetAction(assetId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  return run(() => deleteAsset(prisma, admin.id, id(assetId)));
}

/** Serahkan aset ke karyawan (INV-02). */
export async function assignAssetAction(assetId: string, values: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  return run(() => assignAsset(prisma, admin.id, id(assetId), assignAssetSchema.parse(values)));
}

/** Catat pengembalian aset (INV-02). */
export async function returnAssetAction(assetId: string, values: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  return run(() => returnAsset(prisma, admin.id, id(assetId), returnAssetSchema.parse(values)));
}
