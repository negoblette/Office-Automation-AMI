import type { ConfirmOptions } from "@/components/shared/feedback";

/** Konfirmasi clock out — sama di panel Dashboard (`AttendanceHero`) dan kartu halaman Absensi (`ClockCard`). */
export const CLOCK_OUT_CONFIRM: ConfirmOptions = {
  title: "Clock out sekarang?",
  description: "Jam pulang tidak bisa diubah lagi (kecuali dikoreksi Admin).",
  confirmLabel: "Clock Out",
  cancelLabel: "Belum",
};
