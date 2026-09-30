import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { isLoginLocked, recordLoginFailure } from "@/lib/services/login-throttle";
import { resetDb, testDb } from "@/test/db";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testDb.$disconnect();
});

describe("login throttle (Tech Spec §9)", () => {
  it("terkunci setelah 5 gagal dalam 15 menit, per email (case-insensitive)", async () => {
    for (let i = 0; i < 4; i++) await recordLoginFailure(testDb, "Andi@Artha-Mitra.local", null);
    expect(await isLoginLocked(testDb, "andi@artha-mitra.local")).toBe(false);
    await recordLoginFailure(testDb, "andi@artha-mitra.local", null);
    expect(await isLoginLocked(testDb, "ANDI@artha-mitra.local")).toBe(true);
    expect(await isLoginLocked(testDb, "sinta@artha-mitra.local")).toBe(false);
  });

  it("terbuka lagi setelah 15 menit", async () => {
    for (let i = 0; i < 5; i++) await recordLoginFailure(testDb, "andi@artha-mitra.local", null);
    expect(await isLoginLocked(testDb, "andi@artha-mitra.local", new Date(Date.now() + 16 * 60_000))).toBe(false);
  });
});
