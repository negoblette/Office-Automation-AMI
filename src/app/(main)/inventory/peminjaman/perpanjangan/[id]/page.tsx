import { notFound, redirect } from "next/navigation";
import { requireInventory } from "@/lib/auth/inventory";
import { prisma } from "@/lib/db";
import { loanIdOfExtension } from "@/lib/services/demo-loan-extension";

/**
 * Link perpanjangan (email approval, lonceng, Approval Center — Tahap 16.4) → halaman detail peminjamannya, tempat
 * perpanjangan ditampilkan & diputuskan. Akses sama dengan halaman peminjaman (user Inventaris).
 */
export default async function LoanExtensionRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  await requireInventory("view");
  const { id } = await params;
  const loanId = await loanIdOfExtension(prisma, id);
  if (!loanId) notFound();
  redirect(`/inventory/peminjaman/${loanId}#perpanjangan`);
}
