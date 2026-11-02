import { redirect } from "next/navigation";

/** "Inventory Saya" digabung ke Asset Kantor (2026-11-02): unit Inventory yang diserahkan tampil di sana. */
export default function ProfilInventoryPage() {
  redirect("/profil/aset");
}
