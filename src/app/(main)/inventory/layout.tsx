import { requireInventory } from "@/lib/auth/inventory";

/** Inventory (2026-11-17): hanya Admin, Operational, dan divisi Engineer & Sales — selain itu 404. Tiap page tetap memanggil guard sendiri. */
export default async function InventoryLayout({ children }: { children: React.ReactNode }) {
  await requireInventory("view");
  return children;
}
