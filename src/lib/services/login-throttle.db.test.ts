import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { isLoginLocked, recordLoginFailure } from "@/lib/services/login-throttle";
import { resetDb, testDb } from "@/test/db";

const fromIp = (ip: string) => ({ ip, userAgent: "vitest" });

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testDb.$disconnect();
});

describe("login throttle (Tech Spec §9, hardening 2026-10)", () => {
  it("tanpa IP: terkunci setelah 5 gagal per email (case-insensitive)", async () => {
    for (let i = 0; i < 4; i++) await recordLoginFailure(testDb, "Andi@Artha-Mitra.local", null);
    expect(await isLoginLocked(testDb, "andi@artha-mitra.local")).toBe(false);
    await recordLoginFailure(testDb, "andi@artha-mitra.local", null);
    expect(await isLoginLocked(testDb, "ANDI@artha-mitra.local")).toBe(true);
    expect(await isLoginLocked(testDb, "sinta@artha-mitra.local")).toBe(false);
  });

  it("terbuka lagi setelah 15 menit", async () => {
    for (let i = 0; i < 5; i++) await recordLoginFailure(testDb, "andi@artha-mitra.local", null, fromIp("10.0.0.1"));
    expect(await isLoginLocked(testDb, "andi@artha-mitra.local", "10.0.0.1", new Date(Date.now() + 16 * 60_000))).toBe(false);
  });

  it("email + IP: 5 gagal dari satu IP hanya menahan IP itu, pemilik akun dari IP lain tetap bisa", async () => {
    for (let i = 0; i < 5; i++) await recordLoginFailure(testDb, "andi@artha-mitra.local", null, fromIp("10.0.0.1"));
    expect(await isLoginLocked(testDb, "andi@artha-mitra.local", "10.0.0.1")).toBe(true);
    expect(await isLoginLocked(testDb, "andi@artha-mitra.local", "10.0.0.2")).toBe(false);
  });

  it("satu IP ke banyak email (password spraying): 20 gagal menahan IP itu", async () => {
    for (let i = 0; i < 20; i++) await recordLoginFailure(testDb, `user${i}@artha-mitra.local`, null, fromIp("10.0.0.9"));
    expect(await isLoginLocked(testDb, "baru@artha-mitra.local", "10.0.0.9")).toBe(true);
    expect(await isLoginLocked(testDb, "baru@artha-mitra.local", "10.0.0.8")).toBe(false);
  });

  it("satu email dari banyak IP: 20 gagal menahan email itu", async () => {
    for (let i = 0; i < 20; i++) await recordLoginFailure(testDb, "andi@artha-mitra.local", null, fromIp(`10.0.1.${i}`));
    expect(await isLoginLocked(testDb, "andi@artha-mitra.local", "10.0.2.1")).toBe(true);
  });
});
