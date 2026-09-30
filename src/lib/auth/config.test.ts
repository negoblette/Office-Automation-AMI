import { describe, expect, it } from "vitest";
import { authConfig } from "@/lib/auth/config";

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
