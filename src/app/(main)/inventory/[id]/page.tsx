import { ChevronRight, CircleAlert, CircleCheck, Pencil, Plus, Send, Trash2, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/shared/empty-state";
import { describeRange, getPageNumbers } from "@/components/table/pagination";
import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { requireInventory } from "@/lib/auth/inventory";
import { prisma } from "@/lib/db";
import { isActiveLoanStatus, loanPurposeText, RETURN_CONDITION_LABEL } from "@/lib/demo-loan";
import { formatDate, formatDateTime } from "@/lib/format";
import { ownershipText, rackLocationLabel } from "@/lib/inventory";
import { ASSET_CATEGORY_LABEL } from "@/lib/labels";
import { type AssetHistoryEvent, assetHistory } from "@/lib/services/asset-history";
import { listAssets } from "@/lib/services/asset-queries";
import { assetLoanHistory } from "@/lib/services/demo-loan-queries";
import { listRacks } from "@/lib/services/storage-rack";
import { cn } from "@/lib/utils";
import { AssetFormDialog } from "../asset-dialogs";
import { LoanStatus } from "../peminjaman/loan-table";

export const metadata: Metadata = { title: "Detail Unit" };

const isoDate = (iso: string | null) => (iso ? formatDate(`${iso}T00:00:00Z`, "short") : "—");

const EVENT_ICON: Record<AssetHistoryEvent["kind"], { icon: LucideIcon; tile: string }> = {
  created: { icon: Plus, tile: "bg-brand-soft text-brand-deep" },
  updated: { icon: Pencil, tile: "bg-panel text-ink-2" },
  deleted: { icon: Trash2, tile: "bg-red-soft text-red-deep" },
  loan: { icon: Send, tile: "bg-amber-soft text-amber-deep" },
  approved: { icon: CircleCheck, tile: "bg-green-soft text-green-deep" },
  rejected: { icon: CircleAlert, tile: "bg-red-soft text-red-deep" },
};

/** Riwayat Unit per halaman (2026-11-19, permintaan user: maksimal 10). */
const HISTORY_PAGE_SIZE = 10;

/**
 * Detail unit: data, peminjaman, dan riwayat lengkap (siapa mengubah apa, kapan; pengajuan pinjam & keputusannya).
 * Riwayat dibagi per halaman lewat `?riwayat=<n>` (link bisa dibagikan, tanpa JavaScript).
 */
export default async function AssetDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ riwayat?: string }> }) {
  const { access } = await requireInventory("view");
  const { id } = await params;
  const { riwayat } = await searchParams;
  const [asset] = await listAssets(prisma, id);
  if (!asset) notFound();
  const [loans, history, racks] = await Promise.all([
    assetLoanHistory(prisma, asset.id),
    assetHistory(prisma, asset.id),
    access.canManage ? listRacks(prisma) : [],
  ]);
  const busy = loans.some((loan) => isActiveLoanStatus(loan.status));
  // Halaman riwayat: angka tidak valid / di luar jangkauan → halaman terdekat yang ada.
  const historyPages = Math.max(1, Math.ceil(history.length / HISTORY_PAGE_SIZE));
  const requestedPage = Number.parseInt(riwayat ?? "1", 10);
  const historyPage = Number.isInteger(requestedPage) ? Math.min(Math.max(requestedPage, 1), historyPages) : 1;
  const historyShown = history.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE);
  const historyHref = (page: number) => `/inventory/${asset.id}${page > 1 ? `?riwayat=${page}` : ""}#riwayat`;
  const rackOptions = racks.map(({ id: rackId, name, columns, rows }) => ({ id: rackId, name, columns, rows }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={asset.deviceName}
        description={`SN ${asset.serialNo} · ${ASSET_CATEGORY_LABEL[asset.category]}`}
        breadcrumbs={[{ label: "Operasional & Aset" }, { label: "Inventaris / Unit Demo", href: "/inventory" }, { label: asset.serialNo }]}
        actions={
          (access.canManage || !busy) && (
            <>
              {access.canManage && (
                <AssetFormDialog
                  asset={asset}
                  racks={rackOptions}
                  trigger={
                    <button type="button" className={buttonVariants({ size: "lg", variant: "outline" })}>
                      <Pencil aria-hidden /> Ubah Unit
                    </button>
                  }
                />
              )}
              {!busy && (
                <Link href={`/inventory/peminjaman/baru?unit=${asset.id}`} className={buttonVariants({ size: "lg" })}>
                  <Send aria-hidden /> Ajukan Peminjaman
                </Link>
              )}
            </>
          )
        }
      />
      <section className="grid gap-4 rounded-2xl bg-card p-5 shadow-card sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Kepemilikan", ownershipText(asset.ownership, asset.ownerName)],
          ["Lokasi", rackLocationLabel(asset.rackName, asset.rackPosition) ?? "Tidak di rak"],
          ["Support mulai", isoDate(asset.supportStart)],
          ["Support berakhir", isoDate(asset.supportEnd)],
          ["Warranty mulai", isoDate(asset.warrantyStart)],
          ["Warranty berakhir", isoDate(asset.warrantyEnd)],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
            <p className="mt-1 font-medium">{value}</p>
          </div>
        ))}
        {(asset.warrantyNote || asset.notes) && (
          <p className="text-sm text-muted-foreground sm:col-span-3 lg:col-span-6">{[asset.warrantyNote, asset.notes].filter(Boolean).join(" · ")}</p>
        )}
      </section>

      {/* Terakhir kembali dari peminjaman dengan catatan (Tahap 16.5) — sampai ada pengembalian berikutnya yang Baik. */}
      {!busy && asset.lastReturn && asset.lastReturn.condition !== "GOOD" && (
        <p role="status" className="flex items-start gap-2.5 rounded-2xl bg-red-soft px-5 py-4 text-sm text-red-deep">
          <CircleAlert className="mt-0.5 size-[18px] shrink-0" aria-hidden />
          <span className="min-w-0 wrap-anywhere">
            <span className="font-semibold">
              Terakhir kembali {RETURN_CONDITION_LABEL[asset.lastReturn.condition].toLowerCase()}
              {asset.lastReturn.returnedAt && ` (${isoDate(asset.lastReturn.returnedAt)})`}.
            </span>{" "}
            {asset.lastReturn.note && `${asset.lastReturn.note}. `}Cek kondisinya sebelum dipinjamkan lagi.
          </span>
        </p>
      )}

      {/* Peminjaman ke perusahaan lain (Product Trial Form, Fase 16), terbaru dulu. */}
      <h2 className="text-lg font-semibold">Peminjaman</h2>
      {loans.length === 0 ? (
        <EmptyState title="Belum pernah dipinjamkan" description="Peminjaman unit ini ke perusahaan lain akan tercatat di sini." />
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-2xl bg-card shadow-card">
          {loans.map((loan) => (
            <li key={loan.loanId}>
              <Link
                href={`/inventory/peminjaman/${loan.loanId}`}
                className="flex items-center gap-4 px-5 py-4 transition-colors duration-200 outline-none hover:bg-panel focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold wrap-anywhere">{loan.borrowerName}</p>
                  <p className="text-sm text-muted-foreground">
                    {loanPurposeText(loan.purpose, loan.purposeDetail)} · {isoDate(loan.startDate)} – {isoDate(loan.dueDate)} · {loan.durationLabel}
                    <span className="font-mono"> · {loan.number}</span>
                  </p>
                </div>
                <LoanStatus status={loan.status} />
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div id="riwayat" className="scroll-mt-24 space-y-1">
        <h2 className="text-lg font-semibold">Riwayat Unit</h2>
        <p className="text-sm text-muted-foreground">Setiap perubahan data unit dan setiap pengajuan pinjam, terbaru di atas.</p>
      </div>
      {history.length === 0 ? (
        <EmptyState title="Belum ada riwayat" description="Perubahan data unit dan pengajuan pinjam akan tercatat di sini." />
      ) : (
        <ol className="flex flex-col rounded-2xl bg-card p-2 shadow-card">
          {historyShown.map((event) => {
            const { icon: Icon, tile } = EVENT_ICON[event.kind];
            return (
              <li key={event.id} className="flex gap-3.5 rounded-[14px] px-3 py-3">
                <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl", tile)} aria-hidden>
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">
                    {event.href ? (
                      <Link href={event.href} className="underline-offset-4 hover:underline">
                        {event.title}
                      </Link>
                    ) : (
                      event.title
                    )}
                  </p>
                  <p className="text-xs text-ink-3">
                    {event.actor ?? "Sistem"} · {formatDateTime(event.at)}
                  </p>
                  {event.note && <p className="mt-1 text-sm wrap-anywhere text-ink-2">{event.note}</p>}
                  {event.changes.length > 0 && (
                    <dl className="mt-1.5 flex flex-col gap-1 text-sm">
                      {event.changes.map((change) => (
                        <div key={change.label} className="flex flex-wrap gap-x-1.5">
                          <dt className="font-semibold text-ink-2">{change.label}:</dt>
                          <dd className="wrap-anywhere text-ink-2">
                            <span className="text-ink-3 line-through decoration-ink-3/60">{change.before}</span>
                            <span aria-hidden> → </span>
                            <span className="sr-only"> diubah menjadi </span>
                            <span className="font-medium text-ink">{change.after}</span>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {history.length > 0 && (
        <div className="-mt-3 flex flex-col gap-3 px-1 text-[13px] sm:flex-row sm:items-center sm:justify-between">
          <p className="text-ink-3">{describeRange(historyPage - 1, HISTORY_PAGE_SIZE, history.length, "riwayat")}</p>
          {historyPages > 1 && (
            <nav aria-label="Halaman riwayat" className="flex items-center gap-1">
              <PageLink href={historyHref(historyPage - 1)} disabled={historyPage === 1}>
                Sebelumnya
              </PageLink>
              <span className="px-2 font-semibold text-ink-2 tabular-nums sm:hidden">
                {historyPage} / {historyPages}
              </span>
              {getPageNumbers(historyPage, historyPages).map((page, index) =>
                page === "…" ? (
                  <span key={`gap-${index}`} className="hidden px-1 text-ink-3 sm:inline">
                    …
                  </span>
                ) : (
                  <Link
                    key={page}
                    href={historyHref(page)}
                    aria-label={`Halaman ${page}`}
                    aria-current={page === historyPage ? "page" : undefined}
                    className={cn(buttonVariants({ size: "sm", variant: page === historyPage ? "default" : "ghost" }), "hidden min-w-9 sm:inline-flex", page === historyPage && "pointer-events-none")}
                  >
                    {page}
                  </Link>
                ),
              )}
              <PageLink href={historyHref(historyPage + 1)} disabled={historyPage === historyPages}>
                Selanjutnya
              </PageLink>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}

/** Tombol Sebelumnya / Selanjutnya: link biasa; di ujung jadi teks nonaktif (bukan link mati). */
function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  if (disabled) {
    return (
      <span aria-disabled="true" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={buttonVariants({ variant: "outline", size: "sm" })}>
      {children}
    </Link>
  );
}
