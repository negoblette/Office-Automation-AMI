import { describe, expect, it } from "vitest";
import { authConfig, isPublicPath, SESSION_ABSOLUTE_MS } from "@/lib/auth/config";

type AuthorizedParams = Parameters<typeof authConfig.callbacks.authorized>[0];

function check(pathname: string, loggedIn: boolean) {
  const params = {
    request: { nextUrl: new URL(`http://localhost${pathname}`) },
    auth: loggedIn ? { user: { id: "u1" }, expires: "2099-01-01" } : null,
  } as unknown as AuthorizedParams;
  return authConfig.callbacks.authorized(params);
}

describe("authConfig.callbacks.authorized (proxy)", () => {
  it("halaman login boleh dibuka tanpa login", () => {
    expect(check("/login", false)).toBe(true);
  });

  it("halaman aplikasi tanpa login ditolak", () => {
    expect(check("/dashboard", false)).toBe(false);
    expect(check("/setting/user", false)).toBe(false);
    expect(check("/", false)).toBe(false);
  });

  it("halaman aplikasi dengan login diizinkan (role dicek di server, bukan di proxy)", () => {
    expect(check("/dashboard", true)).toBe(true);
    expect(check("/setting", true)).toBe(true);
  });
});

type JwtParams = Parameters<typeof authConfig.callbacks.jwt>[0];

describe("authConfig.callbacks.jwt (batas sesi, hardening 2026-10)", () => {
  it("login: token berisi data user, versi sesi, dan waktu login", () => {
    const user = { id: "u1", role: "STAFF", employeeId: "e1", sessionVersion: 3 };
    const token = authConfig.callbacks.jwt({ token: {}, user } as unknown as JwtParams);
    expect(token).toMatchObject({ userId: "u1", role: "STAFF", employeeId: "e1", sessionVersion: 3 });
    expect(typeof token?.loginAt).toBe("number");
  });

  it("token lewat batas absolut dibuang", () => {
    const token = { userId: "u1", role: "STAFF", employeeId: null, sessionVersion: 0, loginAt: Date.now() - SESSION_ABSOLUTE_MS - 1000 };
    expect(authConfig.callbacks.jwt({ token } as unknown as JwtParams)).toBeNull();
  });

  it("token lama tanpa waktu login dibuang", () => {
    expect(authConfig.callbacks.jwt({ token: { userId: "u1" } } as unknown as JwtParams)).toBeNull();
  });
});

describe("isPublicPath (dipakai proxy.ts, hardening Tahap 3)", () => {
  it("halaman login publik, halaman aplikasi tidak", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/dashboard")).toBe(false);
    expect(isPublicPath("/ganti-password")).toBe(false);
    expect(isPublicPath("/")).toBe(false);
  });
});
