import "server-only";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { inventoryEnabled } from "@/lib/features";
import { inventoryAccess } from "@/lib/services/inventory-access";
import { requireUser } from "./guards";

/**
 * Guard halaman Inventory (2026-11-17): `view` = Admin, Operational, divisi Engineer & Sales; `manage` (kelola unit &
 * rak) = Admin & Operational; `operate` (langkah Operational di peminjaman, 2026-11-19) = HANYA user yang ditunjuk
 * Operational — Admin tidak otomatis. Tidak berhak → 404. Dipanggil di setiap page, bukan hanya di layout.
 */
export async function requireInventory(level: "view" | "manage" | "operate" = "view") {
  const user = await requireUser();
  const access = await inventoryAccess(prisma, user);
  const allowed = level === "operate" ? access.isOperational : level === "manage" ? access.canManage : access.canView;
  if (!inventoryEnabled(user) || !allowed) notFound();
  return { user, access };
}
