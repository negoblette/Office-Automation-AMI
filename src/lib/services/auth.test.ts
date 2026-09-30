import argon2 from "argon2";
import { beforeAll, describe, expect, it } from "vitest";
import { type AuthRepository, verifyCredentials } from "@/lib/services/auth";

const PASSWORD = "Rahasia123!";

describe("verifyCredentials", () => {
  let repo: AuthRepository;

  beforeAll(async () => {
    const passwordHash = await argon2.hash(PASSWORD);
    const users = [
      { id: "u1", email: "andi@artha-mitra.local", passwordHash, role: "STAFF" as const, isActive: true, employeeId: "e1", employee: { fullName: "Andi Pratama" } },
      { id: "u2", email: "resign@artha-mitra.local", passwordHash, role: "STAFF" as const, isActive: false, employeeId: "e2", employee: { fullName: "Mantan Staf" } },
    ];
    repo = { findUserByEmail: async (email) => users.find((u) => u.email === email) ?? null };
  });

  it("login benar mengembalikan user beserta role & employeeId", async () => {
    const result = await verifyCredentials(repo, "andi@artha-mitra.local", PASSWORD);
    expect(result).toEqual({
      ok: true,
      user: { id: "u1", email: "andi@artha-mitra.local", name: "Andi Pratama", role: "STAFF", employeeId: "e1" },
    });
  });

  it("email dinormalisasi (trim & lowercase)", async () => {
    const result = await verifyCredentials(repo, "  ANDI@Artha-Mitra.local ", PASSWORD);
    expect(result.ok).toBe(true);
  });

  it("password salah ditolak", async () => {
    const result = await verifyCredentials(repo, "andi@artha-mitra.local", "salah");
    expect(result).toEqual({ ok: false, reason: "INVALID_CREDENTIALS" });
  });

  it("email tidak terdaftar ditolak dengan alasan yang sama", async () => {
    const result = await verifyCredentials(repo, "tidakada@artha-mitra.local", PASSWORD);
    expect(result).toEqual({ ok: false, reason: "INVALID_CREDENTIALS" });
  });

  it("user nonaktif ditolak", async () => {
    const result = await verifyCredentials(repo, "resign@artha-mitra.local", PASSWORD);
    expect(result).toEqual({ ok: false, reason: "INACTIVE" });
  });

  it("status nonaktif tidak terungkap jika password salah", async () => {
    const result = await verifyCredentials(repo, "resign@artha-mitra.local", "salah");
    expect(result).toEqual({ ok: false, reason: "INVALID_CREDENTIALS" });
  });
});
