// Pembaca kalender publik Google "Hari Libur di Indonesia" (2026-11-18) — tanpa internet.
import { afterEach, describe, expect, it, vi } from "vitest";
import { combineHolidayFeeds, fetchFeed, HolidaySourceError, parseIcsEvents } from "./google-calendar";

type Ev = { start: string; end?: string; summary: string; desc: string };

/** Susun teks .ics seperti dari Google (CRLF, baris panjang dipotong 75 karakter). */
function ics(events: Ev[]): string {
  const fold = (line: string) => line.match(/.{1,75}/g)!.join("\r\n ");
  const body = events.flatMap((e) => [
    "BEGIN:VEVENT",
    `DTSTART;VALUE=DATE:${e.start}`,
    ...(e.end ? [`DTEND;VALUE=DATE:${e.end}`] : []),
    fold(`SUMMARY:${e.summary}`),
    fold(`DESCRIPTION:${e.desc}`),
    "END:VEVENT",
  ]);
  return ["BEGIN:VCALENDAR", "VERSION:2.0", ...body, "END:VCALENDAR", ""].join("\r\n");
}

const ID: Ev[] = [
  { start: "20270101", end: "20270102", summary: "Hari Tahun Baru", desc: "Hari libur nasional" },
  { start: "20270209", end: "20270210", summary: "1 Ramadan (belum pasti)", desc: "Perayaan\\nUntuk menyembunyikan perayaan\\, buka setelan" },
  { start: "20270309", end: "20270310", summary: "Cuti Bersama Idul Fitri", desc: "Hari libur nasional" },
  { start: "20270310", end: "20270311", summary: "Hari Idul Fitri (belum pasti)", desc: "Hari libur nasional" },
  { start: "20270518", end: "20270519", summary: "Idul Adha (Lebaran Haji)", desc: "Hari libur nasional" },
  { start: "20270817", end: "20270818", summary: "Hari Proklamasi Kemerdekaan R.I. dengan nama yang sangat panjang supaya baris dipotong", desc: "Hari libur nasional" },
];
const EN: Ev[] = [
  { start: "20270101", end: "20270102", summary: "New Year's Day", desc: "Public holiday" },
  { start: "20270209", end: "20270210", summary: "Ramadan Start (tentative)", desc: "Observance\\nTo hide observances\\, go to settings" },
  { start: "20270309", end: "20270310", summary: "Idul Fitri Joint Holiday", desc: "Public holiday" },
  { start: "20270310", end: "20270311", summary: "Idul Fitri (tentative)", desc: "Public holiday" },
  // Feed Indonesia tidak menandai cuti bersama ini; feed Inggris menandai → tetap terdeteksi sebagai cuti bersama.
  { start: "20270518", end: "20270519", summary: "Joint Holiday for Idul Adha", desc: "Public holiday" },
  { start: "20270817", end: "20270818", summary: "Indonesian Independence Day", desc: "Public holiday" },
];

const combine = (id: Ev[], en: Ev[]) => combineHolidayFeeds(parseIcsEvents(ics(id)), parseIcsEvents(ics(en)));

describe("kalender libur Google", () => {
  it("nama dari feed Indonesia, jenis dari feed Inggris; perayaan disaring; baris panjang & escape dibaca benar", () => {
    expect(combine(ID, EN)).toEqual([
      { date: "2027-01-01", name: "Hari Tahun Baru", kind: "NATIONAL", tentative: false },
      { date: "2027-03-09", name: "Cuti Bersama Idul Fitri", kind: "CUTI_BERSAMA", tentative: false },
      { date: "2027-03-10", name: "Hari Idul Fitri (belum pasti)", kind: "NATIONAL", tentative: true },
      { date: "2027-05-18", name: "Idul Adha (Lebaran Haji)", kind: "CUTI_BERSAMA", tentative: false },
      { date: "2027-08-17", name: "Hari Proklamasi Kemerdekaan R.I. dengan nama yang sangat panjang supaya baris dipotong", kind: "NATIONAL", tentative: false },
    ]);
  });

  it("acara beberapa hari dipecah per tanggal (DTEND = hari setelah hari terakhir)", () => {
    const events = parseIcsEvents(ics([{ start: "20270330", end: "20270402", summary: "Libur tiga hari", desc: "Public holiday" }]));
    expect(events.map((e) => e.date)).toEqual(["2027-03-30", "2027-03-31", "2027-04-01"]);
  });

  it("isi yang tidak wajar → seluruh feed ditolak (tidak diambil sebagian)", () => {
    expect(() => parseIcsEvents("<html>bukan kalender</html>")).toThrow(HolidaySourceError);
    expect(() => parseIcsEvents(ics([{ start: "20270230", end: "20270301", summary: "Tanggal mustahil", desc: "Public holiday" }]))).toThrow(HolidaySourceError);
    expect(() => parseIcsEvents(ics([{ start: "20270101", end: "20270201", summary: "Sebulan penuh", desc: "Public holiday" }]))).toThrow(HolidaySourceError);
    expect(() => parseIcsEvents(ics([{ start: "20270101", end: "20270102", summary: "x".repeat(151), desc: "Public holiday" }]))).toThrow(HolidaySourceError);
    // Penanda berubah → berhenti, bukan menebak.
    const renamedMarker = EN.map((e) => ({ ...e, desc: e.desc.replace("Public holiday", "National holiday") }));
    expect(() => combine(ID, renamedMarker)).toThrow("Format penanda kalender Google berubah");
    // Feed Indonesia & Inggris tidak sama (salah satu sedang diperbarui) → dicoba lagi lain kali.
    expect(() => combine(ID.slice(0, 2), EN)).toThrow("tidak sama");
  });
});

describe("unduh feed (hanya dari google.com)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const calendar = (body = ics(EN)) => new Response(body, { status: 200, headers: { "content-type": "text/calendar; charset=utf-8" } });

  it("mengikuti pengalihan hanya ke *.google.com lewat HTTPS", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://calendar.google.com/calendar/ical/x/basic.ics" } }))
      .mockResolvedValueOnce(calendar());
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchFeed("https://calendar.google.com/a.ics")).resolves.toContain("BEGIN:VCALENDAR");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://evil.example.com/a.ics" } })));
    await expect(fetchFeed("https://calendar.google.com/a.ics")).rejects.toThrow("alamat yang tidak dikenal");
    await expect(fetchFeed("http://calendar.google.com/a.ics")).rejects.toThrow("alamat yang tidak dikenal");
  });

  it("format, ukuran, & jaringan bermasalah → pesan jelas", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } })));
    await expect(fetchFeed("https://calendar.google.com/a.ics")).rejects.toThrow("format yang tidak dikenali");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(calendar("x".repeat(1_000_001))));
    await expect(fetchFeed("https://calendar.google.com/a.ics")).rejects.toThrow("terlalu besar");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    await expect(fetchFeed("https://calendar.google.com/a.ics")).rejects.toThrow("HTTP 503");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(fetchFeed("https://calendar.google.com/a.ics")).rejects.toThrow("tidak bisa dihubungi");
  });
});
