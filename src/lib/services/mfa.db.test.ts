import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { isEncryptedValue } from "@/lib/crypto/field-encryption";
import {
  BACKUP_CODE_COUNT,
  MFA_PERIOD_SECONDS,
  confirmMfaSetup,
  currentTotp,
  getMfaStatus,
  mfaRequired,
  regenerateBackupCodes,
  resetUserMfa,
  startMfaSetup,
  verifyLoginMfa,
} from "@/lib/services/mfa";
import { testDb } from "@/test/db";
import { resetAndSeed } from "@/test/seed";

let u: Record<string, string>;
const STEP_MS = MFA_PERIOD_SECONDS * 1000;

beforeEach(async () => {
  u = await resetAndSeed();
});

afterAll(async () => {
  await testDb.$disconnect();
});

/** Daftarkan MFA untuk user; kembalikan rahasia & kode cadangan. */
async function enroll(userId: string) {
  const { secret, uri } = await startMfaSetup(testDb, userId);
  const codes = await confirmMfaSetup(testDb, userId, currentTotp(secret));
  return { secret, uri, codes };
}

describe("MFA / verifikasi dua langkah (hardening Tahap 5)", () => {
  it("wajib untuk Admin & Approver, tidak untuk Staf", () => {
    expect([mfaRequired("ADMIN"), mfaRequired("APPROVER"), mfaRequired("STAFF")]).toEqual([true, true, false]);
  });

  it("pendaftaran: QR tetap sama saat refresh, kode salah ditolak, kode benar → aktif + 10 kode cadangan, rahasia terenkripsi", async () => {
    const first = await startMfaSetup(testDb, u.ika);
    expect(first.uri).toMatch(/^otpauth:\/\/totp\/Office%20Automation%20AMI:ika%40/);
    expect((await startMfaSetup(testDb, u.ika)).secret).toBe(first.secret);
    await expect(confirmMfaSetup(testDb, u.ika, "000000")).rejects.toThrow("Kode salah");

    const codes = await confirmMfaSetup(testDb, u.ika, currentTotp(first.secret));
    expect(codes).toHaveLength(BACKUP_CODE_COUNT);
    expect(codes[0]).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    const user = await testDb.user.findUniqueOrThrow({ where: { id: u.ika } });
    expect(user.mfaPendingSecret).toBeNull();
    expect(isEncryptedValue(user.mfaSecret!)).toBe(true);
    expect(await testDb.mfaBackupCode.findMany({ where: { userId: u.ika } })).not.toContainEqual(expect.objectContaining({ codeHash: codes[0] }));
    expect(await getMfaStatus(testDb, u.ika)).toMatchObject({ enabled: true, backupRemaining: 10, required: true });
    await expect(startMfaSetup(testDb, u.ika)).rejects.toThrow("sudah aktif");
  });

  it("login: belum aktif → lanjut; tanpa kode → diminta; kode benar sekali saja (tidak bisa dipakai ulang); kode salah ditolak", async () => {
    expect(await verifyLoginMfa(testDb, u.andi, undefined)).toEqual({ status: "NOT_ENABLED" });
    const { secret } = await enroll(u.yosep);
    expect(await verifyLoginMfa(testDb, u.yosep, "")).toEqual({ status: "REQUIRED" });
    expect(await verifyLoginMfa(testDb, u.yosep, "123456")).toEqual({ status: "INVALID" });

    // Kode saat pendaftaran sudah terpakai → kode langkah berikutnya.
    const next = currentTotp(secret, Date.now() + STEP_MS);
    expect(await verifyLoginMfa(testDb, u.yosep, next)).toEqual({ status: "OK", usedBackupCode: false });
    expect(await verifyLoginMfa(testDb, u.yosep, next)).toEqual({ status: "INVALID" });
  });

  it("kode cadangan: sekali pakai, huruf kecil & tanpa strip tetap diterima, sisa dihitung", async () => {
    const { codes } = await enroll(u.leonard);
    expect(await verifyLoginMfa(testDb, u.leonard, codes[0].toLowerCase().replace("-", ""))).toEqual({ status: "OK", usedBackupCode: true, backupRemaining: 9 });
    expect(await verifyLoginMfa(testDb, u.leonard, codes[0])).toEqual({ status: "INVALID" });
    // Kode cadangan user lain tidak berlaku.
    const other = await enroll(u.rudy);
    expect(await verifyLoginMfa(testDb, u.leonard, other.codes[1])).toEqual({ status: "INVALID" });
  });

  it("buat ulang kode cadangan wajib kode authenticator; kode lama tidak berlaku", async () => {
    const { secret, codes } = await enroll(u.darwin);
    await expect(regenerateBackupCodes(testDb, u.darwin, "000000")).rejects.toThrow("salah");
    const fresh = await regenerateBackupCodes(testDb, u.darwin, currentTotp(secret, Date.now() + STEP_MS));
    expect(fresh).toHaveLength(BACKUP_CODE_COUNT);
    expect(await verifyLoginMfa(testDb, u.darwin, codes[0])).toEqual({ status: "INVALID" });
    expect(await verifyLoginMfa(testDb, u.darwin, fresh[0])).toMatchObject({ status: "OK", usedBackupCode: true });
  });

  it("Admin me-reset MFA user lain: data MFA dihapus, sesi dicabut, tercatat di audit; tidak bisa untuk diri sendiri", async () => {
    await enroll(u.yosep);
    const before = await testDb.user.findUniqueOrThrow({ where: { id: u.yosep } });
    await expect(resetUserMfa(testDb, u.yosep, u.yosep)).rejects.toThrow("akun sendiri");
    await resetUserMfa(testDb, u.ika, u.yosep);

    const after = await testDb.user.findUniqueOrThrow({ where: { id: u.yosep } });
    expect(after).toMatchObject({ mfaSecret: null, mfaEnabledAt: null, mfaLastStep: null, sessionVersion: before.sessionVersion + 1 });
    expect(await testDb.mfaBackupCode.count({ where: { userId: u.yosep } })).toBe(0);
    expect(await testDb.auditLog.findFirst({ where: { entityId: u.yosep, userId: u.ika }, orderBy: { createdAt: "desc" } })).toMatchObject({
      action: "UPDATE",
      after: { mfaReset: true },
    });
    await expect(resetUserMfa(testDb, u.ika, u.yosep)).rejects.toThrow("belum aktif");
    expect(await verifyLoginMfa(testDb, u.yosep, undefined)).toEqual({ status: "NOT_ENABLED" });
  });
});
