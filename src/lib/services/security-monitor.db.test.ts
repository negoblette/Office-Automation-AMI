import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { smtpTransportOptions } from "@/lib/mail/send-email";
import { isLoginLocked, lockedLoginEmails, recordLoginFailure, unlockLogin } from "@/lib/services/login-throttle";
import { ALERT_RULES, checkPrivilegedLoginFailures, recordDataAccess } from "@/lib/services/security-monitor";
import { setUserActive, setUserRole } from "@/lib/services/user-admin";
import { testDb } from "@/test/db";
import { resetAndSeed } from "@/test/seed";

let u: Record<string, string>;
const meta = { ip: "10.1.2.3", userAgent: "vitest-browser" };

beforeEach(async () => {
  u = await resetAndSeed();
});

afterAll(async () => {
  await testDb.$disconnect();
});

const fail = (email: string, ip = "10.9.9.9") => recordLoginFailure(testDb, email, null, { ip, userAgent: "x" });

describe("audit log permanen (hardening Tahap 6)", () => {
  it("baris AuditLog tidak bisa diubah atau dihapus", async () => {
    await recordLoginFailure(testDb, "andi@artha-mitra.local", null);
    const row = await testDb.auditLog.findFirstOrThrow();
    await expect(testDb.auditLog.update({ where: { id: row.id }, data: { action: "X" } })).rejects.toThrow(/permanen/);
    await expect(testDb.auditLog.deleteMany({})).rejects.toThrow(/permanen/);
    expect(await testDb.auditLog.count()).toBe(1);
  });
});

describe("buka blokir login (hardening Tahap 6)", () => {
  it("Admin membuka blokir: gagal sebelumnya tidak dihitung lagi untuk email itu; batas per IP tetap berlaku", async () => {
    for (let i = 0; i < 5; i++) await fail("andi@artha-mitra.local");
    expect(await isLoginLocked(testDb, "andi@artha-mitra.local", "10.9.9.9")).toBe(true);
    expect(await lockedLoginEmails(testDb, ["andi@artha-mitra.local", "sinta@artha-mitra.local"])).toEqual(new Set(["andi@artha-mitra.local"]));

    await new Promise((resolve) => setTimeout(resolve, 5));
    await unlockLogin(testDb, u.ika, "Andi@artha-mitra.local", meta);
    expect(await isLoginLocked(testDb, "andi@artha-mitra.local", "10.9.9.9")).toBe(false);
    expect(await lockedLoginEmails(testDb, ["andi@artha-mitra.local"])).toEqual(new Set());
    expect(await testDb.auditLog.findFirst({ where: { action: "LOGIN_UNLOCK" } })).toMatchObject({ userId: u.ika, entityId: "andi@artha-mitra.local", ip: "10.1.2.3" });

    // Password spraying dari satu IP tetap tertahan walau satu email dibuka.
    for (let i = 0; i < 20; i++) await fail(`user${i}@artha-mitra.local`, "10.6.6.6");
    await unlockLogin(testDb, u.ika, "user0@artha-mitra.local");
    expect(await isLoginLocked(testDb, "user0@artha-mitra.local", "10.6.6.6")).toBe(true);
  });
});

describe("alarm keamanan ke Admin (hardening Tahap 6)", () => {
  it("login gagal beruntun ke akun Admin/Approver → satu alarm per jendela; akun Staf & email tak dikenal tidak", async () => {
    for (let i = 0; i < ALERT_RULES.privilegedLoginFailures - 1; i++) await fail("ika@artha-mitra.local");
    expect(await checkPrivilegedLoginFailures(testDb, "ika@artha-mitra.local", meta)).toBeNull();
    await fail("ika@artha-mitra.local", "10.8.8.8");
    const alert = await checkPrivilegedLoginFailures(testDb, "IKA@artha-mitra.local", meta);
    expect(alert).toMatchObject({ kind: "LOGIN_FAILURES", title: "Login gagal beruntun ke akun Admin ika@artha-mitra.local" });
    expect(alert!.details.join(" ")).toContain("10.9.9.9, 10.8.8.8");
    await fail("ika@artha-mitra.local");
    expect(await checkPrivilegedLoginFailures(testDb, "ika@artha-mitra.local", meta)).toBeNull(); // sudah dikirim

    for (let i = 0; i < 6; i++) await fail("andi@artha-mitra.local");
    expect(await checkPrivilegedLoginFailures(testDb, "andi@artha-mitra.local")).toBeNull();
    for (let i = 0; i < 6; i++) await fail("tidakada@artha-mitra.local");
    expect(await checkPrivilegedLoginFailures(testDb, "tidakada@artha-mitra.local")).toBeNull();
  });

  it("perubahan role → alarm + audit dengan IP & perangkat; nonaktifkan akun juga mencatat IP", async () => {
    const alert = await setUserRole(testDb, u.ika, u.andi, "APPROVER", meta);
    expect(alert).toMatchObject({ kind: "ROLE_CHANGED", title: "Role Andi Pratama diubah: Staf → Approver" });
    expect(alert!.details).toContain("IP: 10.1.2.3");
    expect(await testDb.auditLog.findFirst({ where: { action: "UPDATE", entity: "User", entityId: u.andi } })).toMatchObject({ ip: "10.1.2.3", userAgent: "vitest-browser" });
    expect(await setUserRole(testDb, u.ika, u.andi, "APPROVER", meta)).toBeNull(); // tidak berubah

    await setUserActive(testDb, u.ika, u.sinta, false, meta);
    expect(await testDb.auditLog.count({ where: { entityId: u.sinta, ip: "10.1.2.3" } })).toBe(1);
  });

  it("akses data besar-besaran: tiap unduhan/export tercatat; ≥ 50 dalam 1 jam → satu alarm", async () => {
    const access = (i: number) =>
      recordDataAccess(testDb, { actorId: u.yosep, actorName: "Yosep", action: i % 2 ? "DOWNLOAD" : "EXPORT", entity: "File", entityId: `f${i}` }, meta);
    for (let i = 1; i < ALERT_RULES.dataAccessPerHour; i++) expect(await access(i)).toBeNull();
    expect(await access(ALERT_RULES.dataAccessPerHour)).toMatchObject({ kind: "MASS_ACCESS", title: "Akses data besar-besaran oleh Yosep" });
    expect(await access(ALERT_RULES.dataAccessPerHour + 1)).toBeNull();
    expect(await testDb.auditLog.count({ where: { userId: u.yosep, action: { in: ["DOWNLOAD", "EXPORT"] }, ip: "10.1.2.3" } })).toBe(51);
    expect(await testDb.auditLog.count({ where: { action: "SECURITY_ALERT", entity: "MASS_ACCESS" } })).toBe(1);
  });
});

describe("SMTP wajib TLS di produksi (hardening Tahap 6)", () => {
  it("produksi: 587 wajib STARTTLS, 465 TLS langsung, minimal TLS 1.2; dev Mailpit tanpa TLS", () => {
    expect(smtpTransportOptions({ NODE_ENV: "production", SMTP_HOST: "smtp.x", SMTP_PORT: "587" })).toMatchObject({
      secure: false,
      requireTLS: true,
      tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    });
    expect(smtpTransportOptions({ NODE_ENV: "production", SMTP_PORT: "465" })).toMatchObject({ secure: true, requireTLS: false });
    expect(smtpTransportOptions({ NODE_ENV: "development", SMTP_PORT: "1025" })).not.toHaveProperty("requireTLS");
  });
});
