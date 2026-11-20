import { describe, expect, it } from "vitest";
import { HolidaySourceError, combineHolidayFeeds, parseIcsEvents } from "./google-calendar";

type Event = [date: string, summary: string, marker: string];

/** Feed .ics minimal: acara seharian (DTEND = hari berikutnya). */
function ics(events: Event[]): string {
  const next = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const compact = (date: string) => date.replaceAll("-", "");
  const body = events.map(([date, summary, marker]) =>
    ["BEGIN:VEVENT", `DTSTART;VALUE=DATE:${compact(date)}`, `DTEND;VALUE=DATE:${compact(next(date))}`, `DESCRIPTION:${marker}\\nketerangan`, `SUMMARY:${summary}`, "END:VEVENT"].join("\r\n"),
  );
  return ["BEGIN:VCALENDAR", "VERSION:2.0", ...body, "END:VCALENDAR"].join("\r\n");
}

const combine = (id: Event[], en: Event[]) => combineHolidayFeeds(parseIcsEvents(ics(id)), parseIcsEvents(ics(en)));

const EN: Event[] = [
  ["2027-03-09", "Idul Fitri Joint Holiday", "Public holiday"],
  ["2027-03-10", "Idul Fitri (tentative)", "Public holiday"],
  ["2027-12-24", "Christmas Eve", "Observance"],
  ["2027-12-25", "Christmas Day", "Public holiday"],
];

describe("combineHolidayFeeds", () => {
  it("feed Indonesia lama (penanda Hari libur nasional): nama Indonesia, jenis dari feed Inggris", () => {
    const id: Event[] = [
      ["2027-03-09", "Cuti Bersama Idul Fitri", "Hari libur nasional"],
      ["2027-03-10", "Hari Idul Fitri (belum pasti)", "Hari libur nasional"],
      ["2027-12-24", "Malam Natal", "Perayaan"],
      ["2027-12-25", "Hari Raya Natal", "Hari libur nasional"],
    ];
    expect(combine(id, EN)).toEqual([
      { date: "2027-03-09", name: "Cuti Bersama Idul Fitri", kind: "CUTI_BERSAMA", tentative: false },
      { date: "2027-03-10", name: "Hari Idul Fitri (belum pasti)", kind: "NATIONAL", tentative: true },
      { date: "2027-12-25", name: "Hari Raya Natal", kind: "NATIONAL", tentative: false },
    ]);
  });

  it("feed Indonesia baru (semua Perayaan, sejak 2026-11-18): libur tetap terbaca dari feed Inggris", () => {
    const id: Event[] = [
      ["2027-03-09", "Cuti Bersama Idul Fitri", "Perayaan"],
      ["2027-03-10", "Hari Idul Fitri (belum pasti)", "Perayaan"],
      ["2027-12-24", "Malam Natal", "Perayaan"],
      ["2027-12-25", "Hari Raya Natal", "Perayaan"],
    ];
    expect(combine(id, EN).map((holiday) => [holiday.date, holiday.name, holiday.kind])).toEqual([
      ["2027-03-09", "Cuti Bersama Idul Fitri", "CUTI_BERSAMA"],
      ["2027-03-10", "Hari Idul Fitri (belum pasti)", "NATIONAL"],
      ["2027-12-25", "Hari Raya Natal", "NATIONAL"],
    ]);
  });

  it("tanggal berisi libur & perayaan sekaligus: nama perayaan yang dikenal dibuang", () => {
    const en: Event[] = [
      ["2023-03-23", "Joint Holiday for Bali's Day of Silence", "Public holiday"],
      ["2023-03-23", "Ramadan Start", "Observance"],
      ["2024-03-11", "Ramadan Start", "Observance"],
    ];
    const id: Event[] = [
      ["2023-03-23", "1 Ramadan", "Perayaan"],
      ["2023-03-23", "Cuti Bersama Hari Suci Nyepi", "Perayaan"],
      ["2024-03-11", "1 Ramadan", "Perayaan"],
    ];
    expect(combine(id, en)).toEqual([{ date: "2023-03-23", name: "Cuti Bersama Hari Suci Nyepi", kind: "CUTI_BERSAMA", tentative: false }]);
  });

  it("jumlah acara di tanggal libur berbeda → seluruh feed ditolak", () => {
    const id: Event[] = [["2027-12-25", "Hari Raya Natal", "Perayaan"]];
    expect(() => combine(id, EN)).toThrow(HolidaySourceError);
    expect(() => combine(id, EN)).toThrow(/tidak sama/);
  });

  it("penanda tidak dikenal → seluruh feed ditolak", () => {
    const id: Event[] = EN.map(([date]) => [date, "Libur", "Hari libur"]);
    expect(() => combine(id, EN)).toThrow(/Format penanda/);
  });
});
