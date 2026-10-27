import { cn } from "@/lib/utils";

/**
 * Layar status satu halaman: 404, error, sesi bermasalah (audit UI 2026-10-27). Menggantikan halaman
 * bawaan Next.js yang berbahasa Inggris & tanpa jalan kembali. Kode kecil di atas (mis. "404") hanya
 * penanda; judul + penjelasan + aksi yang menjelaskan apa yang bisa dilakukan pengguna.
 */
export function StatusScreen({
  code,
  title,
  description,
  actions,
  detail,
  className,
}: {
  code: string;
  title: string;
  description: React.ReactNode;
  actions: React.ReactNode;
  /** Info teknis untuk dilaporkan ke IT (mis. kode error). */
  detail?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-1 items-center justify-center px-4 py-16", className)}>
      <div className="flex w-full max-w-md flex-col items-center gap-3 text-center">
        <p className="font-mono text-sm font-semibold tracking-[0.2em] text-brand-deep">{code}</p>
        <h1 className="text-[clamp(26px,5vw,32px)] leading-tight font-extrabold tracking-[-0.03em] text-balance text-ink">{title}</h1>
        <p className="max-w-[46ch] text-[15px] text-ink-3">{description}</p>
        <div className="mt-4 flex w-full flex-col-reverse justify-center gap-2 sm:w-auto sm:flex-row">{actions}</div>
        {detail && <p className="mt-4 text-xs text-ink-3">{detail}</p>}
      </div>
    </div>
  );
}
