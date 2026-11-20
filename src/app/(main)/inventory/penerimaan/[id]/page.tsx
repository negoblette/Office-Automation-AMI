import { FileCheckCorner } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { TableScroll } from "@/components/shared/table-scroll";
import { buttonVariants } from "@/components/ui/button";
import { requireInventory } from "@/lib/auth/inventory";
import { prisma } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { ASSET_OWNERSHIP_LABEL } from "@/lib/inventory";
import { ASSET_CATEGORY_LABEL } from "@/lib/labels";
import { getGoodsReceipt } from "@/lib/services/goods-receipt-queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Detail Penerimaan Barang" };

const date = (iso: string) => formatDate(`${iso}T00:00:00Z`, "short");

/** Detail penerimaan barang principal / distributor (2026-11-20) + Cetak HAF. Semua user Inventaris boleh melihat. */
export default async function GoodsReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireInventory("view");
  const { id } = await params;
  const receipt = await getGoodsReceipt(prisma, id);
  if (!receipt) notFound();

  const info: [string, React.ReactNode, React.ReactNode?][] = [
    ["Dari", receipt.ownerName, ASSET_OWNERSHIP_LABEL[receipt.ownership]],
    ["Kontak (up:)", receipt.contactName],
    ["Tanggal terima", date(receipt.receivedDate)],
    ["PIC", receipt.picName, "Penanggung jawab dari AMI"],
    ["Pengirim (Returned By)", receipt.senderName ?? "—"],
    ["Diterima oleh (Received By)", receipt.receiverName],
    ["Dicatat (Prepared By)", receipt.preparedByName, formatDateTime(receipt.createdAt)],
    ["No. HAF", <span key="haf" className="font-mono">{receipt.hafNumber}</span>, "Hardware Admission Form"],
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={receipt.ownerName}
        breadcrumbs={[
          { label: "Operasional & Aset" },
          { label: "Inventaris / Unit Demo", href: "/inventory" },
          { label: "Penerimaan Barang", href: "/inventory/penerimaan" },
          { label: receipt.hafNumber },
        ]}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{receipt.hafNumber}</span>
            <span aria-hidden>·</span>
            {ASSET_OWNERSHIP_LABEL[receipt.ownership]}
            <span aria-hidden>·</span>
            {receipt.unitCount} unit
          </span>
        }
        actions={
          <Link href={`/cetak/penerimaan/${receipt.id}`} className={buttonVariants({ size: "lg" })}>
            <FileCheckCorner aria-hidden /> Cetak HAF
          </Link>
        }
      />

      <section className="grid gap-x-8 gap-y-4 rounded-2xl bg-card p-5 shadow-card sm:grid-cols-2 lg:grid-cols-4">
        {info.map(([label, value, sub]) => (
          <div key={label} className="min-w-0">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
            <p className="mt-1 font-medium wrap-anywhere">{value}</p>
            {sub && <p className="text-xs wrap-anywhere text-muted-foreground">{sub}</p>}
          </div>
        ))}
        {receipt.purpose && (
          <div className="min-w-0 sm:col-span-2 lg:col-span-4">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Keperluan / catatan</p>
            <p className="mt-1 font-medium wrap-anywhere whitespace-pre-line">{receipt.purpose}</p>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Unit ({receipt.unitCount})</h2>
        <TableScroll as="div" label="Unit yang diterima" className="rounded-2xl bg-card shadow-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/60 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3">Part number / deskripsi</th>
                <th className="px-4 py-3">Serial number</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3">Lokasi sekarang</th>
              </tr>
            </thead>
            <tbody>
              {receipt.units.map((unit) => (
                <tr key={unit.id} className="border-t border-border align-top">
                  <td className="px-4 py-3">
                    {unit.deleted ? (
                      <span className="font-medium text-muted-foreground">{unit.deviceName} (dihapus)</span>
                    ) : (
                      <Link href={`/inventory/${unit.id}`} className="font-medium underline-offset-4 hover:underline">
                        {unit.deviceName}
                      </Link>
                    )}
                    {unit.notes && <span className="block text-xs wrap-anywhere text-muted-foreground">{unit.notes}</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{unit.serialNo}</td>
                  <td className="px-4 py-3">{ASSET_CATEGORY_LABEL[unit.category]}</td>
                  <td className="px-4 py-3">
                    <span className={cn(!unit.location && "text-muted-foreground")}>{unit.location ?? "Tidak di rak"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </section>
    </div>
  );
}
