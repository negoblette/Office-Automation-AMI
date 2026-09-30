import { notFound } from "next/navigation";
import { FEATURES } from "@/lib/features";

/** Modul Inventory ditunda (FEATURES.inventory) → semua halaman /inventory 404. */
export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  if (!FEATURES.inventory) notFound();
  return children;
}
