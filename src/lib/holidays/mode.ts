// Cara mengambil libur nasional dari kalender Google (2026-11-27 — server produksi tidak punya akses internet):
//  - "server"  (bawaan, dev): worker mengunduh feed .ics sendiri setiap hari 06:00 WIB + tombol Admin — butuh internet.
//  - "browser" (produksi)   : browser Admin mengambil dari Google Calendar API saat tombol "Sinkronkan sekarang" ditekan,
//    lalu mengirim hasilnya ke server; server & worker tidak pernah menghubungi internet. Aturan sinkronisasi sama.
// Nilai dibaca container app (halaman, server action, CSP) DAN worker (jadwal harian) — keduanya wajib diisi sama.
export type HolidaySyncMode = "server" | "browser";

export const holidaySyncMode = (): HolidaySyncMode => (process.env.HOLIDAY_SYNC_MODE === "browser" ? "browser" : "server");

/**
 * Satu-satunya alamat luar yang boleh dihubungi browser (CSP connect-src) di mode browser — hanya path Calendar API,
 * bukan seluruh www.googleapis.com (domain itu juga melayani upload Cloud Storage yang bisa dipakai membocorkan data).
 */
export const GOOGLE_CALENDAR_API_CSP = "https://www.googleapis.com/calendar/v3/calendars/";
