// Mode browser (2026-11-27, `lib/holidays/mode.ts`): dijalankan di BROWSER Admin, bukan di server. Server produksi tidak
// punya internet, jadi browser Admin (yang punya) mengambil kalender libur Google lewat Google Calendar API, meringkas
// acaranya, lalu mengirimnya ke server action `syncHolidaysFromBrowserAction` yang memvalidasi ulang semuanya.
// API key dibatasi Tim IT di Google Cloud: hanya Calendar API & hanya dari alamat aplikasi (docs/07-DEPLOYMENT.md §4.5).
import { type BrowserEvent, GOOGLE_HOLIDAY_CALENDARS } from "./google-calendar";

/** Error yang pesannya aman ditampilkan ke Admin. */
export class GoogleFetchError extends Error {}

type ApiItem = { summary?: unknown; description?: unknown; start?: { date?: unknown } | null; end?: { date?: unknown } | null };

const TIMEOUT_MS = 15_000;
const MAX_PAGES = 5;

/** Semua acara satu kalender libur, awal tahun `year` s/d akhir tahun berikutnya (jangkauan sinkronisasi). */
async function fetchCalendar(calendarId: string, apiKey: string, year: number): Promise<BrowserEvent[]> {
  const events: BrowserEvent[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    url.search = new URLSearchParams({
      key: apiKey,
      singleEvents: "true",
      maxResults: "2500",
      timeMin: `${year}-01-01T00:00:00+07:00`,
      timeMax: `${year + 2}-01-01T00:00:00+07:00`,
      ...(pageToken ? { pageToken } : {}),
    }).toString();

    let response: Response;
    try {
      // Tanpa cookie; hanya asal (origin) aplikasi yang dikirim sebagai Referer — dipakai Google membatasi API key.
      response = await fetch(url, { credentials: "omit", referrerPolicy: "strict-origin", signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new GoogleFetchError("Komputer ini tidak bisa menghubungi Google — pastikan terhubung ke internet, lalu coba lagi");
    }
    if (response.status === 400 || response.status === 403) {
      throw new GoogleFetchError("Google menolak permintaan (API key tidak valid / dibatasi) — hubungi Tim IT");
    }
    if (!response.ok) throw new GoogleFetchError(`Kalender Google sedang bermasalah (HTTP ${response.status}) — coba lagi nanti`);

    let body: { items?: unknown; nextPageToken?: unknown } | null;
    try {
      body = (await response.json()) as typeof body;
    } catch {
      body = null;
    }
    if (!body || typeof body !== "object") throw new GoogleFetchError("Kalender Google mengirim format yang tidak dikenali");
    const items = Array.isArray(body.items) ? body.items.filter((item): item is ApiItem => typeof item === "object" && item !== null) : [];
    for (const item of items) {
      events.push({
        summary: typeof item.summary === "string" ? item.summary : "",
        description: typeof item.description === "string" ? item.description : "",
        start: typeof item.start?.date === "string" ? item.start.date : null,
        end: typeof item.end?.date === "string" ? item.end.date : null,
      });
    }
    if (typeof body.nextPageToken !== "string" || !body.nextPageToken) return events;
    pageToken = body.nextPageToken;
  }
  throw new GoogleFetchError("Data kalender Google terlalu banyak — sinkronisasi dihentikan");
}

/** Kedua kalender (bahasa Indonesia = nama, bahasa Inggris = jenis libur), sama seperti feed .ics di mode server. */
export async function fetchHolidayFeedsInBrowser(apiKey: string, year: number): Promise<{ id: BrowserEvent[]; en: BrowserEvent[] }> {
  const [id, en] = await Promise.all([
    fetchCalendar(GOOGLE_HOLIDAY_CALENDARS.id, apiKey, year),
    fetchCalendar(GOOGLE_HOLIDAY_CALENDARS.en, apiKey, year),
  ]);
  return { id, en };
}
