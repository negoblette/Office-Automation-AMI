import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Decrypter, armor, identityToRecipient } from "age-encryption";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type RecoveryOptions,
  createRecoveryKey,
  getRecoveryOverview,
  identityFileName,
  identityFromFile,
  recoveryReminder,
  refreshRecoveryFiles,
  testRecoveryPassphrase,
} from "@/lib/services/recovery-key";
import { testDb } from "@/test/db";
import { resetAndSeed } from "@/test/seed";

const LOGIN = "Rahasia123!"; // password akun seed di test
const RUDY = "rudy@artha-mitra.local";
const LEONARD = "leonard@artha-mitra.local";
const RUDY_PASS = "kopi pahit di teras belakang";
const LEONARD_PASS = "hujan sore jalan sudirman macet";

let u: Record<string, string>;
let dir: string;
let options: RecoveryOptions;

beforeEach(async () => {
  u = await resetAndSeed();
  dir = await mkdtemp(path.join(tmpdir(), "oa-recovery-"));
  // Faktor kerja scrypt diturunkan supaya test cepat (produksi: 18, bawaan age).
  options = { dir, holders: [RUDY, LEONARD], workFactor: 10 };
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

afterAll(async () => {
  await testDb.$disconnect();
});

/** Buka file kunci pemulihan dengan kata sandi (implementasi age bawaan library) → kunci pribadi. */
async function unlockIdentity(email: string, passphrase: string): Promise<string> {
  const decrypter = new Decrypter();
  decrypter.addPassphrase(passphrase);
  const text = await decrypter.decrypt(armor.decode(await readFile(path.join(dir, identityFileName(email)), "utf8")), "text");
  return identityFromFile(text)!;
}

async function openEscrow(identity: string): Promise<string> {
  const decrypter = new Decrypter();
  decrypter.addIdentity(identity);
  return decrypter.decrypt(armor.decode(await readFile(path.join(dir, "kunci-data.age"), "utf8")), "text");
}

const recipientLines = async () => (await readFile(path.join(dir, "penerima.txt"), "utf8")).split("\n").filter((line) => line.startsWith("age1"));

describe("kunci pemulihan (Setting → Kunci Pemulihan)", () => {
  it("hanya pemegang kunci; password login wajib benar; kata sandi pemulihan beda dari password login & tidak memuat nama", async () => {
    await expect(createRecoveryKey(testDb, u.ika, { passphrase: RUDY_PASS, loginPassword: LOGIN }, undefined, options)).rejects.toThrow(
      "bukan pemegang kunci",
    );
    await expect(createRecoveryKey(testDb, u.rudy, { passphrase: RUDY_PASS, loginPassword: "salah-password" }, undefined, options)).rejects.toMatchObject({
      message: "Password login salah",
      field: "loginPassword",
    });
    await expect(createRecoveryKey(testDb, u.rudy, { passphrase: LOGIN, loginPassword: LOGIN }, undefined, options)).rejects.toThrow(
      "berbeda dari password login",
    );
    await expect(createRecoveryKey(testDb, u.rudy, { passphrase: "rudy suka kopi pahit sekali", loginPassword: LOGIN }, undefined, options)).rejects.toThrow(
      "Kata sandi pemulihan tidak boleh memuat nama atau email Anda",
    );
    expect(await testDb.recoveryKey.count()).toBe(0);
    expect(await readdir(dir)).toEqual([]);
  });

  it("buat kunci: file terkunci kata sandi cocok dengan gembok di database, titipan kunci data bisa dibuka, alarm & audit tercatat", async () => {
    const alert = await createRecoveryKey(testDb, u.rudy, { passphrase: RUDY_PASS, loginPassword: LOGIN }, { ip: "10.0.0.5", userAgent: "test" }, options);
    expect(alert).toMatchObject({ kind: "RECOVERY_KEY_CHANGED", title: "Kunci pemulihan Rudy dibuat" });

    const key = await testDb.recoveryKey.findFirstOrThrow({ where: { userId: u.rudy } });
    expect(key).toMatchObject({ revokedAt: null, verifiedAt: null });
    const identity = await unlockIdentity(RUDY, RUDY_PASS);
    expect(await identityToRecipient(identity)).toBe(key.recipient);
    // Kata sandi salah tidak membuka file kunci.
    await expect(unlockIdentity(RUDY, "bukan kata sandinya sama sekali")).rejects.toThrow();

    expect(await recipientLines()).toEqual([key.recipient]);
    const escrow = (await openEscrow(identity)).split("\n");
    expect(escrow).toContain(`DATA_ENCRYPTION_KEYS="${process.env.DATA_ENCRYPTION_KEYS}"`);
    expect(escrow).toContain(`DATA_INDEX_KEY="${process.env.DATA_INDEX_KEY}"`);
    expect((await readdir(dir)).sort()).toEqual(["BACA-SAYA.txt", "kunci-data.age", identityFileName(RUDY), "penerima.txt"]);

    const audit = await testDb.auditLog.findMany({ where: { userId: u.rudy, entity: "RecoveryKey" } });
    expect(audit).toEqual([expect.objectContaining({ action: "CREATE", entityId: key.id, ip: "10.0.0.5" })]);
    expect(JSON.stringify(audit[0].after)).not.toContain(RUDY_PASS);
    expect(await testDb.auditLog.count({ where: { action: "SECURITY_ALERT", entity: "RECOVERY_KEY_CHANGED", entityId: u.rudy } })).toBe(1);
  });

  it("dua pemegang kunci: backup & titipan dikunci untuk keduanya — masing-masing bisa membuka sendiri", async () => {
    await createRecoveryKey(testDb, u.rudy, { passphrase: RUDY_PASS, loginPassword: LOGIN }, undefined, options);
    await createRecoveryKey(testDb, u.leonard, { passphrase: LEONARD_PASS, loginPassword: LOGIN }, undefined, options);
    expect(await recipientLines()).toHaveLength(2);
    for (const [email, passphrase] of [
      [RUDY, RUDY_PASS],
      [LEONARD, LEONARD_PASS],
    ]) {
      expect(await openEscrow(await unlockIdentity(email, passphrase))).toContain("DATA_ENCRYPTION_KEYS=");
    }
    const overview = await getRecoveryOverview(testDb, options);
    expect(overview.readyCount).toBe(2);
    expect(overview.holders.map((h) => [h.name, h.key?.fileMissing])).toEqual([
      ["Rudy", false],
      ["Leonard", false],
    ]);
  });

  it("ganti kunci: kunci lama tidak dipakai lagi (titipan baru tidak terbuka dengan kunci lama), tetap satu kunci aktif", async () => {
    await createRecoveryKey(testDb, u.rudy, { passphrase: RUDY_PASS, loginPassword: LOGIN }, undefined, options);
    const oldIdentity = await unlockIdentity(RUDY, RUDY_PASS);
    const alert = await createRecoveryKey(testDb, u.rudy, { passphrase: "kata sandi baru yang lebih panjang", loginPassword: LOGIN }, undefined, options);
    expect(alert?.title).toBe("Kunci pemulihan Rudy diganti");

    const keys = await testDb.recoveryKey.findMany({ where: { userId: u.rudy }, orderBy: { createdAt: "asc" } });
    expect(keys.map((k) => k.revokedAt === null)).toEqual([false, true]);
    await expect(unlockIdentity(RUDY, RUDY_PASS)).rejects.toThrow();
    const newIdentity = await unlockIdentity(RUDY, "kata sandi baru yang lebih panjang");
    expect(await recipientLines()).toEqual([keys[1].recipient]);
    expect(await openEscrow(newIdentity)).toContain("DATA_INDEX_KEY=");
    await expect(openEscrow(oldIdentity)).rejects.toThrow();
  });

  it("uji kata sandi: benar → tanggal diuji tersimpan; salah → dicatat; 5 kali salah dalam 15 menit → ditahan", async () => {
    await expect(testRecoveryPassphrase(testDb, u.rudy, RUDY_PASS, undefined, options)).rejects.toThrow("belum membuat kunci pemulihan");
    await createRecoveryKey(testDb, u.rudy, { passphrase: RUDY_PASS, loginPassword: LOGIN }, undefined, options);

    await testRecoveryPassphrase(testDb, u.rudy, RUDY_PASS, undefined, options);
    expect((await testDb.recoveryKey.findFirstOrThrow({ where: { userId: u.rudy } })).verifiedAt).not.toBeNull();
    expect(await testDb.auditLog.count({ where: { userId: u.rudy, action: "RECOVERY_KEY_TESTED" } })).toBe(1);

    for (let i = 0; i < 5; i++) {
      await expect(testRecoveryPassphrase(testDb, u.rudy, `salah ${i}`, undefined, options)).rejects.toMatchObject({
        message: "Kata sandi pemulihan salah",
        field: "passphrase",
      });
    }
    expect(await testDb.auditLog.count({ where: { userId: u.rudy, action: "RECOVERY_KEY_TEST_FAILED" } })).toBe(5);
    await expect(testRecoveryPassphrase(testDb, u.rudy, RUDY_PASS, undefined, options)).rejects.toThrow("Terlalu banyak percobaan");
    // Pemegang lain tidak ikut tertahan.
    await createRecoveryKey(testDb, u.leonard, { passphrase: LEONARD_PASS, loginPassword: LOGIN }, undefined, options);
    await testRecoveryPassphrase(testDb, u.leonard, LEONARD_PASS, undefined, options);
  });

  it("file kunci hilang dari server → status 'hilang' & pengingat; uji kata sandi menyuruh membuat ulang", async () => {
    await createRecoveryKey(testDb, u.rudy, { passphrase: RUDY_PASS, loginPassword: LOGIN }, undefined, options);
    await rm(path.join(dir, identityFileName(RUDY)));
    const overview = await getRecoveryOverview(testDb, options);
    const rudy = overview.holders.find((h) => h.email === RUDY);
    expect(rudy?.key?.fileMissing).toBe(true);
    expect(recoveryReminder(rudy)).toBe("MISSING");
    expect(overview.readyCount).toBe(0);
    await expect(testRecoveryPassphrase(testDb, u.rudy, RUDY_PASS, undefined, options)).rejects.toThrow("tidak ditemukan di server");
  });

  it("refresh: hanya pemegang di konfigurasi yang dipakai; file kunci milik yang dikeluarkan dihapus; tanpa kunci → titipan dihapus", async () => {
    await createRecoveryKey(testDb, u.rudy, { passphrase: RUDY_PASS, loginPassword: LOGIN }, undefined, options);
    await createRecoveryKey(testDb, u.leonard, { passphrase: LEONARD_PASS, loginPassword: LOGIN }, undefined, options);
    await writeFile(path.join(dir, identityFileName("lama@artha-mitra.local")), "sisa");

    const result = await refreshRecoveryFiles(testDb, { dir, holders: [RUDY] });
    expect(result).toEqual({ holders: [RUDY], withKey: [RUDY], withoutKey: [], escrow: true });
    expect(await recipientLines()).toHaveLength(1);
    expect((await readdir(dir)).filter((name) => name.startsWith("kunci-pemulihan-"))).toEqual([identityFileName(RUDY)]);

    expect(await refreshRecoveryFiles(testDb, { dir, holders: ["ika@artha-mitra.local"] })).toMatchObject({ withKey: [], withoutKey: ["ika@artha-mitra.local"], escrow: false });
    expect(await recipientLines()).toEqual([]);
    expect(await readdir(dir)).not.toContain("kunci-data.age");
  });
});
