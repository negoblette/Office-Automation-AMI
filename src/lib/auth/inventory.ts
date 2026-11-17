import "server-only";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { inventoryEnabled } from "@/lib/features";
import { inventoryAccess } from "@/lib/services/inventory-access";
import { requireUser } from "./guards";

/**
 * Guard halaman Inventory (2026-11-17): `view` = Admin, Operational, divisi Engineer & Sales; `manage` = Admin &
 * Operational. Tidak berhak → 404 (menu memang tidak ditampilkan). Dipanggil di setiap page, bukan hanya di layout.
 */
export async function requireInventory(level: "view" | "manage" = "view") {
  const user = await requireUser();
  const access = await inventoryAccess(prisma, user);
  const allowed = level === "manage" ? access.canManage : access.canView;
  if (!inventoryEnabled(user) || !allowed) notFound();
  return { user, access };
}
