// Sumber libur nasional: kalender publik Google "Hari Libur di Indonesia" (2026-11-18, menggantikan API apipedia yang
// baru punya data tahun berjalan). Gratis, tanpa daftar & tanpa token — tidak ada rahasia yang perlu dijaga.
//
// Dua feed .ics dibaca (format diverifikasi 2026-11-18: 2021–2027, ±28 acara/tahun):
//  - bahasa Inggris → JENIS: penanda DESCRIPTION "Public holiday" / "Observance"; cuti bersama selalu bernama "… Joint
//    Holiday …" (feed bahasa Indonesia tidak konsisten, mis. 18 Mei 2027 cuti bersama hanya bernama "Idul Adha");
//  - bahasa Indonesia → NAMA yang ditampilkan ("… (belum pasti)" = tanggal belum final). Penandanya TIDAK dipakai untuk
//    menentukan libur: sejak 2026-11-18 Google menandai semua acaranya "Perayaan" (sebelumnya "Hari libur nasional").
// Isi feed = data luar yang tidak dipercaya: alamat tetap (HTTPS), pengalihan hanya ke *.google.com, batas waktu & ukuran,
// format & penanda wajib dikenali, tanggal & nama divalidasi. Ada yang aneh → seluruh feed ditolak (tidak ada yang
// berubah, Admin melihat pesannya), bukan diambil sebagian.

export const GOOGLE_HOLIDAY_FEEDS = {
  id: "https://calendar.google.com/calendar/ical/id.indonesian%23holiday%40group.v.calendar.google.com/public/basic.ics",
  en: "https://calendar.google.com/calendar/ical/en.indonesian%23holiday%40group.v.calendar.google.com/public/basic.ics",
} as const;

const TIMEOUT_MS = 15_000;
const MAX_FEED_CHARS = 1_000_000;
const MAX_EVENTS = 2_000;
const MAX_REDIRECTS = 3;
const MAX_EVENT_DAYS = 14;
const MAX_NAME_CHARS = 150;

const MARKERS = {
  id: { holiday: "Hari libur nasional", observance: "Perayaan" },
  en: { holiday: "Public holiday", observance: "Observance" },
} as const;
const JOINT = /joint holiday|cuti bersama/i;
const TENTATIVE = /\((belum pasti|tentative)\)/i;

export type ExternalHoliday = {
  /** YYYY-MM-DD */
  date: string;
  name: string;
  kind: "NATIONAL" | "CUTI_BERSAMA";
  /** Tanggal belum final (biasanya hari raya Islam sebelum sidang isbat / SKB). */
  tentative: boolean;
};

/** Error yang pesannya aman ditampilkan ke Admin (tanpa isi feed / detail teknis). */
export class HolidaySourceError extends Error {}

type Lang = keyof typeof MARKERS;
type FeedEvent = { date: string; summary: string; marker: string };

const isRealDate = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) && new Date(`${iso}T00:00:00Z`).toISOString().startsWith(iso);
const hasControlChars = (text: string) => [...text].some((char) => { const code = char.charCodeAt(0); return code < 0x20 || code === 0x7f || code === 0x2028 || code === 0x2029; });
const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const icsDate = (value: string | undefined) => (value && /^\d{8}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : null);
/** Teks iCalendar: `\n` = baris baru, `\,` `\;` `\\` = karakter itu sendiri. */
const unescapeText = (value: string) => value.replace(/\\([\\;,nN])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));

const invalid = () => new HolidaySourceError("Isi kalender Google tidak wajar — sinkronisasi dihentikan, dicoba lagi di cek berikutnya");

/** Satu acara seharian (DTSTART;VALUE=DATE). DTEND = hari SETELAH hari terakhir; acara beberapa hari dipecah per tanggal. */
function toEvents(fields: Record<string, string>): FeedEvent[] {
  const start = icsDate(fields.DTSTART);
  if (!start) return []; // bukan acara seharian → bukan libur
  const end = fields.DTEND ? icsDate(fields.DTEND) : addDays(start, 1);
  if (!isRealDate(start) || !end || !isRealDate(end)) throw invalid();
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000);
  if (days < 1 || days > MAX_EVENT_DAYS) throw invalid();
  const summary = unescapeText(fields.SUMMARY ?? "").trim();
  if (!summary || summary.length > MAX_NAME_CHARS || hasControlChars(summary)) throw invalid();
  const marker = unescapeText(fields.DESCRIPTION ?? "").split("\n")[0].trim();
  return Array.from({ length: days }, (_, index) => ({ date: addDays(start, index), summary, marker }));
}

/** Baca acara dari teks .ics (baris panjang disambung dulu; hanya DTSTART / DTEND / SUMMARY / DESCRIPTION yang dipakai). */
export function parseIcsEvents(text: string): FeedEvent[] {
  if (!text.startsWith("BEGIN:VCALENDAR")) throw new HolidaySourceError("File kalender Google tidak dikenali");
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const events: FeedEvent[] = [];
  let current: Record<string, string> | null = null;
  let count = 0;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
    } else if (line === "END:VEVENT") {
      if (current) events.push(...toEvents(current));
      current = null;
      if (++count > MAX_EVENTS) throw invalid();
    } else if (current) {
      const colon = line.indexOf(":");
      if (colon < 1) continue;
      const key = line.slice(0, colon).split(";")[0].toUpperCase();
      if (key === "DTSTART" || key === "DTEND" || key === "SUMMARY" || key === "DESCRIPTION") current[key] = line.slice(colon + 1);
    }
  }
  return events;
}

/** Semua acara per tanggal. Penanda wajib dikenali: kalau Google mengganti katanya, lebih baik berhenti (terlihat Admin). */
function eventsByDate(events: FeedEvent[], lang: Lang): Map<string, FeedEvent[]> {
  const { holiday, observance } = MARKERS[lang];
  if (events.some((event) => event.marker !== holiday && event.marker !== observance)) {
    throw new HolidaySourceError("Format penanda kalender Google berubah — sinkronisasi dihentikan, perlu diperiksa");
  }
  const byDate = new Map<string, FeedEvent[]>();
  for (const event of events) byDate.set(event.date, [...(byDate.get(event.date) ?? []), event]);
  return byDate;
}

const isEnHoliday = (event: FeedEvent) => event.marker === MARKERS.en.holiday;

/**
 * Acara feed Indonesia yang merupakan libur di satu tanggal (untuk nama). Sejak 2026-11-18 feed Indonesia menandai SEMUA
 * acara "Perayaan" (termasuk Natal), jadi penandanya tidak bisa diandalkan — jenis selalu dari feed Inggris. Tanggal yang
 * berisi libur & perayaan sekaligus (jarang, mis. 1 Ramadan + cuti bersama Nyepi 2023): pakai penanda Indonesia bila masih
 * membedakan, selain itu buang nama yang dikenal sebagai perayaan; tetap tidak bisa dipisah → semua nama hari itu.
 */
function idHolidayEvents(idEvents: FeedEvent[], enEvents: FeedEvent[], idObservanceNames: Set<string>): FeedEvent[] {
  const holidays = enEvents.filter(isEnHoliday).length;
  if (holidays === enEvents.length) return idEvents;
  const marked = idEvents.filter((event) => event.marker === MARKERS.id.holiday);
  if (marked.length === holidays) return marked;
  const unknown = idEvents.filter((event) => !idObservanceNames.has(event.summary));
  return unknown.length === holidays ? unknown : idEvents;
}

/**
 * Gabungkan feed Inggris (tanggal & jenis libur) dengan feed Indonesia (nama). Kedua feed wajib memuat acara yang sama:
 * di setiap tanggal libur, jumlah acaranya harus sama — selain itu seluruh feed ditolak.
 */
export function combineHolidayFeeds(idEvents: FeedEvent[], enEvents: FeedEvent[]): ExternalHoliday[] {
  const id = eventsByDate(idEvents, "id");
  const en = eventsByDate(enEvents, "en");
  const holidayDates = [...en.keys()].filter((date) => en.get(date)!.some(isEnHoliday)).sort();
  if (holidayDates.some((date) => id.get(date)?.length !== en.get(date)!.length)) {
    throw new HolidaySourceError("Kalender Google bahasa Indonesia & Inggris sedang tidak sama — dicoba lagi di cek berikutnya");
  }
  // Nama perayaan versi Indonesia: acara di tanggal yang di feed Inggris hanya berisi perayaan.
  const idObservanceNames = new Set<string>();
  for (const [date, events] of en) {
    if (!events.some(isEnHoliday)) for (const event of id.get(date) ?? []) idObservanceNames.add(event.summary);
  }
  return holidayDates.map((date) => {
    const enHolidays = en.get(date)!.filter(isEnHoliday);
    const idHolidays = idHolidayEvents(id.get(date)!, en.get(date)!, idObservanceNames);
    const kind = enHolidays.every((event) => JOINT.test(event.summary)) ? "CUTI_BERSAMA" : "NATIONAL";
    // Tanggal yang juga punya acara cuti bersama: nama libur nasionalnya saja.
    const preferred = kind === "NATIONAL" ? idHolidays.filter((event) => !JOINT.test(event.summary)) : [];
    const name = [...new Set((preferred.length ? preferred : idHolidays).map((event) => event.summary))].join(" / ");
    if (name.length > MAX_NAME_CHARS) throw invalid();
    return { date, name, kind, tentative: [...idHolidays, ...enHolidays].some((event) => TENTATIVE.test(event.summary)) };
  });
}

const isGoogleUrl = (url: URL) => url.protocol === "https:" && (url.hostname === "google.com" || url.hostname.endsWith(".google.com"));

/** Baca isi respons dengan batas ukuran (tidak menampung seluruh isi dulu baru dicek). */
async function readLimited(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_FEED_CHARS) throw new HolidaySourceError("File kalender Google terlalu besar");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    if (text.length > MAX_FEED_CHARS) {
      await reader.cancel();
      throw new HolidaySourceError("File kalender Google terlalu besar");
    }
  }
  return text + decoder.decode();
}

/** Unduh satu feed: HTTPS, pengalihan hanya ke *.google.com (maks. 3), batas waktu & ukuran, wajib text/calendar. */
export async function fetchFeed(url: string): Promise<string> {
  let target = new URL(url);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isGoogleUrl(target)) throw new HolidaySourceError("Kalender Google dialihkan ke alamat yang tidak dikenal — dihentikan");
    let response: Response;
    try {
      response = await fetch(target, { redirect: "manual", headers: { Accept: "text/calendar" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new HolidaySourceError("Kalender Google tidak bisa dihubungi (jaringan / timeout)");
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) break;
      target = new URL(location, target);
      continue;
    }
    if (!response.ok) throw new HolidaySourceError(`Kalender Google gagal dibuka (HTTP ${response.status})`);
    if (!(response.headers.get("content-type") ?? "").startsWith("text/calendar")) {
      throw new HolidaySourceError("Kalender Google mengirim format yang tidak dikenali");
    }
    return readLimited(response);
  }
  throw new HolidaySourceError("Kalender Google dialihkan terlalu banyak — dihentikan");
}

/** Semua libur (nasional & cuti bersama) dari kalender Google, semua tahun yang tersedia, urut tanggal. */
export async function fetchGoogleHolidays(): Promise<ExternalHoliday[]> {
  const [idText, enText] = await Promise.all([fetchFeed(GOOGLE_HOLIDAY_FEEDS.id), fetchFeed(GOOGLE_HOLIDAY_FEEDS.en)]);
  return combineHolidayFeeds(parseIcsEvents(idText), parseIcsEvents(enText));
}
