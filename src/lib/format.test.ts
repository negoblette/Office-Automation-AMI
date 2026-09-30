import { describe, expect, expectTypeOf, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatNpwp,
  formatPhone,
  formatRupiah,
  formatTenure,
  serializeMoney,
  toJakartaIsoDate,
} from "@/lib/format";

describe("formatRupiah", () => {
  it.each([
    [1_291_825, "Rp 1.291.825"],
    [1_291_825n, "Rp 1.291.825"],
    [0, "Rp 0"],
    [500, "Rp 500"],
    [-1000, "-Rp 1.000"],
    [-1000n, "-Rp 1.000"],
    [9_007_199_254_740_993n, "Rp 9.007.199.254.740.993"], // BigInt di atas batas number tetap presisi
  ])("%s → %j", (input, expected) => {
    expect(formatRupiah(input)).toBe(expected);
  });

  it("memakai spasi biasa, bukan NBSP", () => {
    expect(formatRupiah(1000)).not.toMatch(/ /);
  });
});

describe("formatDate / formatDateTime (Asia/Jakarta)", () => {
  // Kolom @db.Date dari Prisma: UTC tengah malam.
  const dbDate = new Date("2026-09-24T00:00:00Z");

  it("tanggal @db.Date tampil di hari yang sama", () => {
    expect(formatDate(dbDate)).toBe("24 September 2026");
    expect(formatDate(dbDate, "short")).toBe("24 Sep 2026");
    expect(formatDate(dbDate, "weekday")).toBe("Kamis, 24 September 2026");
  });

  it("menerima string ISO", () => {
    expect(formatDate("2026-12-31T00:00:00Z")).toBe("31 Desember 2026");
  });

  it("waktu dikonversi ke WIB dengan format jam:menit", () => {
    expect(formatDateTime("2026-09-24T02:42:00Z")).toBe("24 Sep 2026, 09:42 WIB");
  });

  it("lewat tengah malam WIB sudah berganti hari", () => {
    const utc = "2026-09-24T18:30:00Z"; // 25 Sep 01:30 WIB
    expect(formatDateTime(utc)).toBe("25 Sep 2026, 01:30 WIB");
    expect(toJakartaIsoDate(utc)).toBe("2026-09-25");
  });

  it("toJakartaIsoDate untuk @db.Date", () => {
    expect(toJakartaIsoDate(dbDate)).toBe("2026-09-24");
  });
});

describe("formatNpwp", () => {
  it("15 digit → format titik-strip", () => {
    expect(formatNpwp("012345678901000")).toBe("01.234.567.8-901.000");
  });

  it("16 digit ditampilkan apa adanya", () => {
    expect(formatNpwp("3171012345678901")).toBe("3171012345678901");
  });
});

describe("formatPhone", () => {
  it.each([
    ["+6281234567890", "0812-3456-7890"],
    ["+62812345678", "0812-3456-78"],
    ["+6281234567890123", "0812-3456-7890-123"],
  ])("%j → %j", (input, expected) => {
    expect(formatPhone(input)).toBe(expected);
  });

  it("nilai bukan +62 dikembalikan apa adanya", () => {
    expect(formatPhone("021-5551234")).toBe("021-5551234");
  });
});

describe("serializeMoney", () => {
  it("BigInt bersarang menjadi number, Date & nilai lain tetap", () => {
    const submittedAt = new Date("2026-09-24T02:42:00Z");
    const input = {
      id: "r1",
      total: 1_290_000n,
      submittedAt,
      approvedAt: null,
      items: [
        { amount: 450_000n, note: "Tol" },
        { amount: 840_000n, note: "Hotel" },
      ],
    };

    const result = serializeMoney(input);

    expect(result).toEqual({
      id: "r1",
      total: 1_290_000,
      submittedAt,
      approvedAt: null,
      items: [
        { amount: 450_000, note: "Tol" },
        { amount: 840_000, note: "Hotel" },
      ],
    });
    expect(result.submittedAt).toBeInstanceOf(Date);
    expectTypeOf(result.total).toEqualTypeOf<number>();
    expectTypeOf(result.items[0].amount).toEqualTypeOf<number>();
  });

  it("tidak mengubah object asli", () => {
    const input = { total: 1n };
    serializeMoney(input);
    expect(input.total).toBe(1n);
  });

  it("nominal di atas batas aman ditolak (tanpa pembulatan diam-diam)", () => {
    expect(() => serializeMoney({ total: 9_007_199_254_740_993n })).toThrow(RangeError);
  });
});

describe("formatTenure", () => {
  it.each([
    ["2021-02-01", "2026-09-24", "5 th 7 bln"],
    ["2026-06-24", "2026-09-24", "3 bln"],
    ["2026-06-25", "2026-09-24", "2 bln"], // belum genap 3 bulan
    ["2025-09-24", "2026-09-24", "1 th"],
    ["2026-09-01", "2026-09-24", "< 1 bln"],
  ])("%s s/d %s → %s", (start, today, expected) => {
    expect(formatTenure(`${start}T00:00:00Z`, `${today}T05:00:00Z`)).toBe(expected);
  });
});
