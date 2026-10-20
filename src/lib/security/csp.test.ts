import { describe, expect, it } from "vitest";
import { buildCsp, cspHeaderName } from "@/lib/security/csp";

describe("Content Security Policy (hardening Tahap 3)", () => {
  it("produksi: script hanya bernonce, tanpa unsafe-eval, wajib HTTPS", () => {
    const policy = buildCsp("abc123", false);
    expect(policy).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(policy).not.toContain("unsafe-eval");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("upgrade-insecure-requests");
  });

  it("dev: unsafe-eval untuk debugging React, tanpa upgrade-insecure-requests", () => {
    const policy = buildCsp("abc123", true);
    expect(policy).toContain("'unsafe-eval'");
    expect(policy).not.toContain("upgrade-insecure-requests");
  });

  it("nama header sesuai mode", () => {
    expect(cspHeaderName("enforce")).toBe("Content-Security-Policy");
    expect(cspHeaderName("report-only")).toBe("Content-Security-Policy-Report-Only");
  });
});
