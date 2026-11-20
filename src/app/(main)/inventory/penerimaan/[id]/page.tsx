import { FileCheckCorner, Undo2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { TableScroll } from "@/components/shared/table-scroll";
import { buttonVariants } from "@/components/ui/button";
import { requireInventory } from "@/lib/auth/inventory";
import { prisma } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { ASSET_OWNERSHIP_LABEL } from "@/lib/inventory";
import { ASSET_CATEGORY_LABEL } from "@/lib/labels";
import { type GoodsReceiptUnit, getGoodsReceipt } from "@/lib/services/goods-receipt-queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Detail Penerimaan Barang" };

const date = (iso: string) => formatDate(`${iso}T00:00:00Z`, "short");

/**
 * Detail penerimaan barang principal / distributor (2026-11-20) + Cetak HAF. Semua user Inventaris boleh melihat.
 * Pengembalian ke principal / distributor (per unit, HAF baru) hanya untuk Operational.
 */
export default async function GoodsReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { access } = await requireInventory("view");
  const { id } = await params;
  const receipt = await getGoodsReceipt(prisma, id);
  if (!receipt) notFound();
  const returnable = receipt.units.filter((unit) => unit.status.kind === "AVAILABLE").length;
  const allReturned = receipt.unitCount > 0 && receipt.returnedCount === receipt.unitCount;

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
            {receipt.returnedCount > 0 && (
              <StatusBadge variant={allReturned ? "success" : "warning"}>
                {allReturned ? "Sudah dikembalikan semua" : `${receipt.returnedCount} dari ${receipt.unitCount} unit dikembalikan`}
              </StatusBadge>
            )}
          </span>
        }
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            {/* Pengembalian ke principal / distributor (2026-11-20): unit yang masih di AMI & tidak sedang dipakai. */}
            {access.isOperational && returnable > 0 && (
              <Link href={`/inventory/penerimaan/${receipt.id}/kembali`} className={buttonVariants({ size: "lg", variant: "outline" })}>
                <Undo2 aria-hidden /> Kembalikan ke {receipt.ownerName}
              </Link>
            )}
            <Link href={`/cetak/penerimaan/${receipt.id}`} className={buttonVariants({ size: "lg" })}>
              <FileCheckCorner aria-hidden /> Cetak HAF
            </Link>
          </div>
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
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/60 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3">Part number / deskripsi</th>
                <th className="px-4 py-3">Serial number</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3">Lokasi sekarang</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {receipt.units.map((unit) => (
                <tr key={unit.id} className="border-t border-border align-top">
                  <td className="px-4 py-3">
                    {unit.status.kind === "AVAILABLE" || unit.status.kind === "BUSY" ? (
                      <Link href={`/inventory/${unit.id}`} className="font-medium underline-offset-4 hover:underline">
                        {unit.deviceName}
                      </Link>
                    ) : (
                      <span className="font-medium text-muted-foreground">{unit.deviceName}</span>
                    )}
                    {unit.notes && <span className="block text-xs wrap-anywhere text-muted-foreground">{unit.notes}</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{unit.serialNo}</td>
                  <td className="px-4 py-3">{unit.category ? ASSET_CATEGORY_LABEL[unit.category] : "—"}</td>
                  <td className="px-4 py-3">
                    {unit.status.kind === "RETURNED" ? (
                      <span className="text-muted-foreground">Di {receipt.ownerName}</span>
                    ) : (
                      <span className={cn(!unit.location && "text-muted-foreground")}>{unit.location ?? "Tidak di rak"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <UnitStatus unit={unit} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </section>

      {receipt.returns.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Pengembalian ke {receipt.ownerName}</h2>
          <ul className="flex flex-col gap-3">
            {receipt.returns.map((goodsReturn) => (
              <li key={goodsReturn.id} className="flex flex-col gap-3 rounded-2xl bg-card p-5 shadow-card sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1 text-sm">
                  <p className="font-semibold">
                    {date(goodsReturn.returnedDate)} · <span className="font-mono">{goodsReturn.hafNumber}</span>
                  </p>
                  <p className="text-muted-foreground">
                    Diserahkan {goodsReturn.returnedByName} ke {goodsReturn.receivedByName ?? receipt.ownerName} (up: {goodsReturn.contactName}) · dicatat{" "}
                    {goodsReturn.preparedByName}
                  </p>
                  <ul className="list-disc pl-5">
                    {goodsReturn.units.map((unit) => (
                      <li key={unit.assetId} className="wrap-anywhere">
                        {unit.deviceName} <span className="font-mono text-xs text-muted-foreground">SN {unit.serialNo}</span>
                      </li>
                    ))}
                  </ul>
                  {goodsReturn.note && <p className="wrap-anywhere whitespace-pre-line text-muted-foreground">Catatan: {goodsReturn.note}</p>}
                </div>
                <Link href={`/cetak/pengembalian/${goodsReturn.id}`} className={cn(buttonVariants({ variant: "outline" }), "shrink-0 self-start")}>
                  <FileCheckCorner aria-hidden /> Cetak HAF
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function UnitStatus({ unit }: { unit: GoodsReceiptUnit }) {
  switch (unit.status.kind) {
    case "AVAILABLE":
      return <StatusBadge variant="success">Di AMI</StatusBadge>;
    case "BUSY":
      return <StatusBadge variant="pending">{unit.status.label}</StatusBadge>;
    case "RETURNED":
      return (
        <span className="flex flex-col items-start gap-1">
          <StatusBadge variant="neutral">Dikembalikan</StatusBadge>
          <span className="text-xs text-muted-foreground">
            {date(unit.status.date)} · <span className="font-mono">{unit.status.hafNumber}</span>
          </span>
        </span>
      );
    case "DELETED":
      return <StatusBadge variant="neutral">Dihapus</StatusBadge>;
  }
}
