"use client";

// Umpan balik aksi pengguna (audit UI 2026-10-27), pengganti `window.confirm` / `window.alert` bawaan browser:
//  - `confirm()` → dialog konfirmasi berdesain aplikasi (Base UI AlertDialog: diumumkan sebagai peringatan, fokus awal
//    di "Batal", tombol berbahaya merah & terpisah). Mengembalikan Promise<boolean>.
//  - `notify()`  → notifikasi kecil (Base UI Toast): sukses/info hilang sendiri ±4,5 detik & diumumkan sopan ke pembaca
//    layar; error menetap sampai ditutup & diumumkan segera. Tidak mencuri fokus.
// Dipasang sekali di root layout; komponen memakai `useFeedback()`.
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Toast } from "@base-ui/react/toast";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ConfirmOptions = {
  title: string;
  /** Akibat aksi, mis. "File tidak bisa dikembalikan." */
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` = aksi menghapus / tidak bisa dibatalkan → tombol merah. */
  tone?: "danger" | "default";
};

export type NotifyTone = "success" | "danger" | "info";

type FeedbackApi = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  notify: (message: string, tone?: NotifyTone) => void;
};

const FeedbackContext = createContext<FeedbackApi | null>(null);

/** Cadangan bila dipakai di luar provider (mis. test): perilaku browser lama. */
const FALLBACK: FeedbackApi = {
  confirm: async ({ title, description }) => window.confirm(typeof description === "string" ? `${title}\n\n${description}` : title),
  notify: (message, tone) => {
    if (tone === "danger") window.alert(message);
  },
};

export function useFeedback(): FeedbackApi {
  return useContext(FeedbackContext) ?? FALLBACK;
}

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  return (
    <Toast.Provider timeout={4500} limit={3}>
      <FeedbackLayer>{children}</FeedbackLayer>
      <Toast.Portal>
        <Toast.Viewport className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-[70] flex flex-col gap-2 outline-none sm:right-6 sm:bottom-6 sm:left-auto sm:w-[22rem]">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

type PendingConfirm = ConfirmOptions & { resolve: (ok: boolean) => void };

function FeedbackLayer({ children }: { children: React.ReactNode }) {
  const toasts = Toast.useToastManager();
  const [open, setOpen] = useState(false);
  // Isi dialog disimpan terpisah dari `open` supaya teks tidak hilang selama animasi menutup.
  const [request, setRequest] = useState<PendingConfirm | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setRequest({ ...options, resolve });
        setOpen(true);
      }),
    [],
  );
  const notify = useCallback(
    (message: string, tone: NotifyTone = "success") => {
      toasts.add({ title: message, type: tone, priority: tone === "danger" ? "high" : "low", timeout: tone === "danger" ? 0 : undefined });
    },
    [toasts],
  );
  const api = useMemo(() => ({ confirm, notify }), [confirm, notify]);

  const settle = (ok: boolean) => {
    request?.resolve(ok);
    setRequest((current) => (current ? { ...current, resolve: () => undefined } : current));
    setOpen(false);
  };
  const danger = request?.tone === "danger";

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      <AlertDialog.Root
        open={open}
        onOpenChange={(next) => {
          if (!next) settle(false);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-scrim transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
          <AlertDialog.Popup
            initialFocus={cancelRef}
            className="fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-[26px] bg-white p-6 text-sm text-ink shadow-(--elev-dialog) transition-[opacity,transform] duration-200 ease-smooth outline-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0"
          >
            <div className="flex items-start gap-3.5">
              <span
                className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", danger ? "bg-red-soft text-red-ink" : "bg-brand-soft text-brand-deep")}
                aria-hidden
              >
                {danger ? <CircleAlert className="size-5" /> : <Info className="size-5" />}
              </span>
              <div className="flex min-w-0 flex-col gap-1.5 pt-1">
                <AlertDialog.Title className="text-lg leading-snug font-extrabold tracking-[-0.02em] text-ink">{request?.title}</AlertDialog.Title>
                {request?.description && <AlertDialog.Description className="text-sm text-ink-3">{request.description}</AlertDialog.Description>}
              </div>
            </div>
            <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <AlertDialog.Close ref={cancelRef} render={<Button type="button" variant="outline" />}>
                {request?.cancelLabel ?? "Batal"}
              </AlertDialog.Close>
              <Button type="button" variant={danger ? "destructive" : "default"} onClick={() => settle(true)}>
                {request?.confirmLabel ?? "Lanjutkan"}
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </FeedbackContext.Provider>
  );
}

const TOAST_ICON: Record<NotifyTone, { icon: typeof Info; className: string }> = {
  success: { icon: CheckCircle2, className: "text-success" },
  danger: { icon: CircleAlert, className: "text-red-ink" },
  info: { icon: Info, className: "text-brand-deep" },
};

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return toasts.map((toast) => {
    const tone = (toast.type as NotifyTone | undefined) ?? "info";
    const { icon: Icon, className } = TOAST_ICON[tone] ?? TOAST_ICON.info;
    return (
      <Toast.Root
        key={toast.id}
        toast={toast}
        className={cn(
          "relative flex items-start gap-3 rounded-[18px] bg-white py-3.5 pr-12 pl-4 text-sm shadow-(--elev-menu) transition-[opacity,transform] duration-300 ease-smooth data-ending-style:translate-y-2 data-ending-style:opacity-0 data-limited:hidden data-starting-style:translate-y-2 data-starting-style:opacity-0",
          tone === "danger" && "shadow-[inset_0_0_0_1px_var(--red-ring),var(--elev-menu)]",
        )}
      >
        <Icon className={cn("mt-px size-5 shrink-0", className)} aria-hidden />
        <Toast.Content className="min-w-0">
          <Toast.Title className="font-semibold text-ink">{toast.title}</Toast.Title>
          {toast.description && <Toast.Description className="mt-0.5 text-ink-3">{toast.description}</Toast.Description>}
        </Toast.Content>
        <Toast.Close
          aria-label="Tutup notifikasi"
          className="absolute top-2 right-2 flex size-9 items-center justify-center rounded-[12px] text-ink-3 transition-colors hover:bg-ink/[0.07] hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
        >
          <X className="size-4" aria-hidden />
        </Toast.Close>
      </Toast.Root>
    );
  });
}
