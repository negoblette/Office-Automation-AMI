"use client";

// Perlindungan isian form panjang (audit UI 2026-10-27):
//  - useUnsavedChangesGuard: form sudah diubah → tanya dulu sebelum pindah halaman lewat link aplikasi, dan
//    browser memperingatkan saat tab ditutup / dimuat ulang.
//  - useFormDraft + DraftNotice: isian disimpan sementara di sessionStorage tab ini, jadi tidak hilang bila
//    halaman termuat ulang atau sesi habis (idle 1 jam → login lagi di tab yang sama). Hilang saat tab ditutup;
//    kunci menyertakan id user supaya tidak terbaca akun lain di komputer bersama.
import { History, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";
import { useFeedback } from "@/components/shared/feedback";
import { Button } from "@/components/ui/button";

export function useUnsavedChangesGuard(dirty: boolean) {
  const router = useRouter();
  const { confirm } = useFeedback();

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    // Tahap capture di document: jalan sebelum handler <Link> React, jadi navigasi bisa ditahan dulu.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      void confirm({
        title: "Tinggalkan halaman ini?",
        description: "Perubahan yang belum disimpan akan hilang.",
        confirmLabel: "Tinggalkan",
        cancelLabel: "Lanjut mengisi",
        tone: "danger",
      }).then((leave) => {
        if (leave) router.push(`${url.pathname}${url.search}${url.hash}`);
      });
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, confirm, router]);
}

type StoredDraft<T> = { savedAt: number; values: T };

const storageKeyOf = (key: string) => `oa:draft:${key}`;

function readDraft<T>(key: string): StoredDraft<T> | null {
  try {
    const raw = window.sessionStorage.getItem(storageKeyOf(key));
    return raw ? (JSON.parse(raw) as StoredDraft<T>) : null;
  } catch {
    return null;
  }
}

/**
 * Simpan isian form sementara (debounce 800 ms) selama form diubah. `restore()` memasukkan draft ke form,
 * `discard()` membuangnya; panggil `clear()` setelah berhasil disimpan ke server.
 */
export function useFormDraft<T extends FieldValues, TOutput extends FieldValues>(form: UseFormReturn<T, unknown, TOutput>, key: string) {
  const [pending, setPending] = useState<StoredDraft<T> | null>(null);

  // Draft lama dibaca setelah hydrate (sessionStorage tidak ada di server).
  useEffect(() => {
    const load = () => setPending(readDraft<T>(key));
    load();
  }, [key]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const subscription = form.watch(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!form.formState.isDirty) return;
        try {
          window.sessionStorage.setItem(storageKeyOf(key), JSON.stringify({ savedAt: Date.now(), values: form.getValues() }));
        } catch {
          // Penyimpanan penuh / diblokir: form tetap jalan tanpa draft.
        }
      }, 800);
    });
    return () => {
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [form, key]);

  const clear = useCallback(() => {
    try {
      window.sessionStorage.removeItem(storageKeyOf(key));
    } catch {
      // abaikan
    }
    setPending(null);
  }, [key]);

  const restore = useCallback(() => {
    if (!pending) return;
    // keepDefaultValues: form tetap dianggap berubah, jadi penjaga pindah halaman tetap aktif.
    form.reset(pending.values, { keepDefaultValues: true });
    setPending(null);
  }, [form, pending]);

  return { pendingDraft: pending, restore, discard: clear, clear };
}

const savedTime = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

/** Pemberitahuan "ada isian yang belum disimpan" dengan pilihan Pulihkan / Buang. */
export function DraftNotice({ savedAt, onRestore, onDiscard }: { savedAt: number; onRestore: () => void; onDiscard: () => void }) {
  return (
    <div role="status" className="flex flex-col gap-3 rounded-2xl bg-info-soft p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2.5 text-sm text-ink">
        <History className="mt-0.5 size-[18px] shrink-0 text-brand-deep" aria-hidden />
        <span>
          <span className="font-semibold">Ada isian yang belum disimpan</span> dari pukul {savedTime.format(savedAt).replace(".", ":")} WIB. Pulihkan untuk
          melanjutkan?
        </span>
      </p>
      <div className="flex shrink-0 gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDiscard}>
          <X aria-hidden /> Buang
        </Button>
        <Button type="button" size="sm" onClick={onRestore}>
          Pulihkan
        </Button>
      </div>
    </div>
  );
}
