/**
 * Kerangka sementara saat pindah halaman (audit UI 2026-10-27): sidebar & topbar tetap, isi halaman diganti
 * bentuk abu-abu seukuran judul, kartu ringkasan, dan tabel — supaya klik menu langsung terasa ditanggapi
 * dan tata letak tidak melompat. Denyut dimatikan bila pengguna memilih kurangi gerak.
 */
export default function MainLoading() {
  const bar = "rounded-full bg-skeleton motion-safe:animate-pulse";
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6 pt-2">
      <span className="sr-only">Memuat halaman…</span>
      <div className="flex flex-col gap-3" aria-hidden>
        <div className={`${bar} h-3.5 w-40`} />
        <div className={`${bar} h-9 w-[min(22rem,80%)]`} />
        <div className={`${bar} h-4 w-[min(32rem,95%)]`} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-3 rounded-2xl bg-card p-5 shadow-card">
            <div className={`${bar} h-3 w-20`} />
            <div className={`${bar} h-7 w-16`} />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-card" aria-hidden>
        <div className={`${bar} h-10 w-full max-w-sm`} />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="size-9 shrink-0 rounded-full bg-skeleton motion-safe:animate-pulse" />
            <div className={`${bar} h-3.5 flex-1`} />
            <div className={`${bar} hidden h-3.5 w-24 sm:block`} />
          </div>
        ))}
      </div>
    </div>
  );
}
