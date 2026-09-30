import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { formatDocumentNumber, nextDocumentNumber } from "@/lib/services/numbering";
import { resetDb, testDb } from "@/test/db";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testDb.$disconnect();
});

describe("formatDocumentNumber", () => {
  it("PREFIX/YYYY/MM/NNNN", () => {
    expect(formatDocumentNumber("RMB", 2026, 9, 1)).toBe("RMB/2026/09/0001");
    expect(formatDocumentNumber("LV", 2026, 12, 123)).toBe("LV/2026/12/0123");
    expect(formatDocumentNumber("HC", 2027, 1, 10000)).toBe("HC/2027/01/10000");
  });
});

describe("nextDocumentNumber", () => {
  const sept = new Date("2026-09-24T03:00:00Z");

  it("berurutan per prefix, prefix lain punya counter sendiri", async () => {
    const run = (prefix: "RMB" | "LV") => testDb.$transaction((tx) => nextDocumentNumber(tx, prefix, sept));
    expect(await run("RMB")).toBe("RMB/2026/09/0001");
    expect(await run("RMB")).toBe("RMB/2026/09/0002");
    expect(await run("LV")).toBe("LV/2026/09/0001");
  });

  it("reset per bulan menurut kalender Jakarta (30 Sep 17:30 UTC = 1 Okt WIB)", async () => {
    await testDb.$transaction((tx) => nextDocumentNumber(tx, "RMB", sept));
    const octoberJakarta = new Date("2026-09-30T17:30:00Z");
    expect(await testDb.$transaction((tx) => nextDocumentNumber(tx, "RMB", octoberJakarta))).toBe("RMB/2026/10/0001");
  });

  it("transaksi yang gagal tidak menghabiskan nomor", async () => {
    await expect(
      testDb.$transaction(async (tx) => {
        await nextDocumentNumber(tx, "EXP", sept);
        throw new Error("submit gagal");
      }),
    ).rejects.toThrow("submit gagal");
    expect(await testDb.$transaction((tx) => nextDocumentNumber(tx, "EXP", sept))).toBe("EXP/2026/09/0001");
  });

  it("50 submit paralel → 50 nomor unik tanpa lompatan", async () => {
    const numbers = await Promise.all(
      Array.from({ length: 50 }, () => testDb.$transaction((tx) => nextDocumentNumber(tx, "HC", sept))),
    );
    expect(new Set(numbers).size).toBe(50);
    expect([...numbers].sort()).toEqual(Array.from({ length: 50 }, (_, i) => formatDocumentNumber("HC", 2026, 9, i + 1)));
  });
});
