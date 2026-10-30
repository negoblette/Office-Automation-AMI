import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { inventoryEnabled } from "@/lib/features";

/** Modul Inventory ditunda (FEATURES.inventory) → semua halaman /inventory 404, kecuali untuk super admin (2026-10-30). */
export default async function InventoryLayout({ children }: { children: React.ReactNode }) {
  if (!inventoryEnabled(await requireUser())) notFound();
  return children;
}
