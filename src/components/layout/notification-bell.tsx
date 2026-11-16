"use client";

import { Popover } from "@base-ui/react/popover";
import { Bell, CircleAlert, FileWarning, Inbox, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useFeedback } from "@/components/shared/feedback";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/actions";
import type { NotificationItem } from "@/lib/services/notifications";
import { cn } from "@/lib/utils";
import { dismissNotificationAction, restoreNotificationAction } from "./actions";

const ICON = { expiry: FileWarning, approval: Inbox, rejected: CircleAlert } as const;
const TILE: Record<NotificationItem["tone"], string> = {
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  info: "bg-brand-soft text-brand-deep",
};

/**
 * Penanda "disembunyikan" di browser. Antrian approval selalu berkunci "approval", jadi penandanya memuat id pengajuan
 * yang dilihat — begitu server mengirim antrian dengan pengajuan baru, notifikasi tampil lagi tanpa muat ulang.
 */
const localId = (item: NotificationItem) => (item.kind === "approval" ? `approval|${[...(item.seen ?? [])].sort().join(",")}` : item.key);

/**
 * Ikon lonceng di topbar (2026-10-13). Sejak 2026-11-16 berupa panel (bukan menu): tiap notifikasi = tautan + tombol
 * × "Hapus notifikasi" yang terpisah (tombol di dalam item menu tidak bisa dicapai keyboard & melanggar ARIA).
 * Notifikasi yang dibuka atau dihapus langsung hilang dari daftar dan dicatat di server (berlaku di semua perangkat);
 * hapus bisa diurungkan ±6 detik. Muncul lagi bila ada kejadian baru — lihat services/notifications.ts.
 */
export function NotificationBell({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  const { notify } = useFeedback();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  // Permintaan hapus yang masih berjalan per notifikasi — "Urungkan" menunggu ini dulu supaya urutannya benar.
  const pending = useRef(new Map<string, Promise<ActionResult>>());
  const links = useRef(new Map<string, HTMLAnchorElement>());
  const titleRef = useRef<HTMLHeadingElement>(null);

  const visible = items.filter((item) => !hidden.has(localId(item)));
  const count = visible.length;

  const setHiddenFor = (item: NotificationItem, value: boolean) =>
    setHidden((current) => {
      const next = new Set(current);
      if (value) next.add(localId(item));
      else next.delete(localId(item));
      return next;
    });

  /** Sembunyikan langsung, lalu catat di server. Gagal → tampil lagi. */
  const dismiss = (item: NotificationItem, reportFailure: boolean) => {
    setHiddenFor(item, true);
    const request = dismissNotificationAction({ key: item.key, seen: item.seen }).catch(
      (): ActionResult => ({ ok: false, error: "Koneksi terputus" }),
    );
    pending.current.set(item.key, request);
    void request.then((result) => {
      if (pending.current.get(item.key) === request) pending.current.delete(item.key);
      if (!result.ok) {
        setHiddenFor(item, false);
        if (reportFailure) notify("Notifikasi gagal dihapus. Coba lagi.", "danger");
      }
    });
    return request;
  };

  const undo = async (item: NotificationItem, request: Promise<ActionResult>) => {
    setHiddenFor(item, false);
    await request;
    const result = await restoreNotificationAction(item.key).catch((): ActionResult => ({ ok: false, error: "Koneksi terputus" }));
    if (!result.ok) {
      setHiddenFor(item, true);
      notify("Notifikasi gagal dikembalikan. Coba lagi.", "danger");
      return;
    }
    // Daftar di layout bisa saja sudah diperbarui tanpa notifikasi ini → ambil ulang dari server.
    router.refresh();
  };

  const remove = (item: NotificationItem, index: number) => {
    // Fokus dipindah SEBELUM barisnya hilang — ke notifikasi berikutnya (atau sebelumnya / judul panel). Kalau tombol
    // yang sedang difokus dihapus lebih dulu, fokus jatuh ke kotak panel dan pengguna keyboard kehilangan posisi.
    const nextKey = visible[index + 1]?.key ?? visible[index - 1]?.key;
    ((nextKey ? links.current.get(nextKey) : undefined) ?? titleRef.current)?.focus();
    const request = dismiss(item, true);
    notify("Notifikasi dihapus", "info", { action: { label: "Urungkan", onClick: () => void undo(item, request) } });
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        render={<Button variant="ghost" size="icon" className="relative" aria-label={count ? `Notifikasi (${count})` : "Notifikasi"} title="Notifikasi" />}
      >
        <Bell className="size-5" aria-hidden />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] leading-5 font-bold text-white tabular-nums">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} collisionPadding={16} className="isolate z-50 outline-none">
          <Popover.Popup className="w-[min(22rem,calc(100vw-2rem))] origin-(--transform-origin) rounded-[20px] bg-white p-1.5 shadow-(--elev-menu) transition-[opacity,transform] duration-150 outline-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <Popover.Title ref={titleRef} tabIndex={-1} className="px-2.5 pt-1.5 pb-2 text-sm font-bold text-ink outline-none">
              Notifikasi
            </Popover.Title>
            {count === 0 ? (
              <p className="px-2.5 pb-3 text-sm text-ink-3">Tidak ada notifikasi. Semua dokumen masih berlaku dan tidak ada yang perlu ditindaklanjuti.</p>
            ) : (
              <ul className="max-h-[70vh] overflow-y-auto">
                {visible.map((item, index) => {
                  const Icon = ICON[item.kind];
                  return (
                    <li key={item.key} className="flex items-start gap-1 rounded-[14px] transition-colors duration-300 focus-within:bg-panel hover:bg-panel">
                      <Link
                        href={item.href}
                        ref={(element) => {
                          if (element) links.current.set(item.key, element);
                          else links.current.delete(item.key);
                        }}
                        onClick={() => {
                          // Dibuka = sudah dilihat: hilang dari daftar. Gagal dicatat → tampil lagi tanpa pesan (tidak penting).
                          void dismiss(item, false);
                          setOpen(false);
                        }}
                        className="flex min-w-0 flex-1 items-start gap-3 rounded-[14px] px-2.5 py-2 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
                      >
                        <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl", TILE[item.tone])} aria-hidden>
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-ink">{item.title}</span>
                          <span className="block truncate text-xs text-ink-3">{item.detail}</span>
                        </span>
                      </Link>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="mt-1.5 mr-1 shrink-0 text-ink-3 hover:text-ink"
                        aria-label={`Hapus notifikasi ${item.title}`}
                        title="Hapus notifikasi"
                        onClick={() => remove(item, index)}
                      >
                        <X aria-hidden />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
