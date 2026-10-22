import { afterEach, describe, expect, it } from "vitest";
import {
  RECOVERY_TEST_INTERVAL_DAYS,
  buildEscrowText,
  buildIdentityFile,
  buildRecipientsFile,
  identityFileName,
  identityFromFile,
  isRecoveryKeyHolder,
  parseRecoveryHolders,
  recoveryReminder,
  type RecoveryHolderStatus,
} from "./recovery-key";

const DAY = 86_400_000;
const originalKeys = process.env.DATA_ENCRYPTION_KEYS;

afterEach(() => {
  process.env.DATA_ENCRYPTION_KEYS = originalKeys;
});

describe("kunci pemulihan — fungsi murni", () => {
  it("daftar pemegang kunci: huruf kecil, tanpa spasi & duplikat; kosong = tidak ada pemegang", () => {
    expect(parseRecoveryHolders(" Rudy@Artha.co.id, leonard@artha.co.id ,rudy@artha.co.id,, ")).toEqual(["rudy@artha.co.id", "leonard@artha.co.id"]);
    expect(parseRecoveryHolders(undefined)).toEqual([]);
    expect(isRecoveryKeyHolder("RUDY@artha.co.id", ["rudy@artha.co.id"])).toBe(true);
    expect(isRecoveryKeyHolder("ika@artha.co.id", ["rudy@artha.co.id"])).toBe(false);
    expect(isRecoveryKeyHolder("rudy@artha.co.id", [])).toBe(false);
  });

  it("nama file kunci per email, karakter aneh tidak bisa keluar dari folder", () => {
    expect(identityFileName("Rudy@Artha-Mitra.co.id")).toBe("kunci-pemulihan-rudy@artha-mitra.co.id.age");
    expect(identityFileName("../x/y@z")).toBe("kunci-pemulihan-.._x_y@z.age");
  });

  it("file kunci pribadi: format identity age dengan komentar, kunci bisa dibaca kembali", () => {
    const text = buildIdentityFile("rudy@x", "AGE-SECRET-KEY-1ABC", "age1xyz", new Date("2026-10-21T00:00:00Z"));
    expect(text.split("\n").filter((line) => line && !line.startsWith("#"))).toEqual(["AGE-SECRET-KEY-1ABC"]);
    expect(text).toContain("# public key: age1xyz");
    expect(identityFromFile(text)).toBe("AGE-SECRET-KEY-1ABC");
    expect(identityFromFile("# hanya komentar\n")).toBeNull();
  });

  it("penerima.txt: satu baris age1… per pemegang kunci, sisanya komentar", () => {
    const text = buildRecipientsFile([
      { email: "rudy@x", recipient: "age1aaa" },
      { email: "leonard@x", recipient: "age1bbb" },
    ]);
    expect(text.split("\n").filter((line) => line.startsWith("age1"))).toEqual(["age1aaa", "age1bbb"]);
    expect(text.split("\n").filter((line) => line && !line.startsWith("age1")).every((line) => line.startsWith("#"))).toBe(true);
    expect(buildRecipientsFile([]).split("\n").some((line) => line.startsWith("age1"))).toBe(false);
  });

  it("titipan kunci data = dua baris .env yang sama persis dengan env; kunci tidak valid ditolak", () => {
    const lines = buildEscrowText().split("\n");
    expect(lines).toContain(`DATA_ENCRYPTION_KEYS="${process.env.DATA_ENCRYPTION_KEYS}"`);
    expect(lines).toContain(`DATA_INDEX_KEY="${process.env.DATA_INDEX_KEY}"`);
    process.env.DATA_ENCRYPTION_KEYS = "v1:ganti-dengan-hasil-keys-generate";
    expect(() => buildEscrowText()).toThrow("DATA_ENCRYPTION_KEYS");
  });

  it("pengingat: belum ada kunci / file hilang → MISSING; > 90 hari sejak diuji (atau dibuat) → TEST_DUE", () => {
    const now = new Date("2026-10-21T00:00:00Z");
    const status = (key: RecoveryHolderStatus["key"]): RecoveryHolderStatus => ({ email: "rudy@x", name: "Rudy", key });
    const daysAgo = (days: number) => new Date(now.getTime() - days * DAY);
    expect(recoveryReminder(undefined, now)).toBeNull();
    expect(recoveryReminder(status(null), now)).toBe("MISSING");
    expect(recoveryReminder(status({ createdAt: daysAgo(1), verifiedAt: null, fileMissing: true }), now)).toBe("MISSING");
    expect(recoveryReminder(status({ createdAt: daysAgo(RECOVERY_TEST_INTERVAL_DAYS - 1), verifiedAt: null, fileMissing: false }), now)).toBeNull();
    expect(recoveryReminder(status({ createdAt: daysAgo(RECOVERY_TEST_INTERVAL_DAYS + 1), verifiedAt: null, fileMissing: false }), now)).toBe("TEST_DUE");
    expect(recoveryReminder(status({ createdAt: daysAgo(400), verifiedAt: daysAgo(10), fileMissing: false }), now)).toBeNull();
  });
});
