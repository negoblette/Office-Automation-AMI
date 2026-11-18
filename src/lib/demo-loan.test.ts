import { describe, expect, it } from "vitest";
import {
  addMonthsIso,
  daysUntilDue,
  dueLabel,
  dueNotificationStage,
  dueReminderStage,
  extensionDueError,
  formatEnglishDate,
  formatHafNumber,
  formatLoanDuration,
  formatTrialPeriod,
  formatTrialFormNumber,
  groupLoanItems,
  defaultLoanEnd,
  loanSpan,
  maxLoanEnd,
  loanPurposeDescription,
  loanPurposeText,
  parseHafNumber,
  parseTrialFormNumber,
  RETURN_CONDITION_ENGLISH,
  romanMonth,
} from "@/lib/demo-loan";
import { ownershipText } from "@/lib/inventory";
import { isSingleAddress, safeSubject } from "@/lib/mail/headers";
import { assetSchema } from "@/lib/validators/asset";
import { demoLoanSchema, returnDemoLoanSchema } from "@/lib/validators/demo-loan";
import { NOTIFICATION_KEY } from "@/lib/validators/notification";

describe("jangka pinjam = tanggal mulai s/d tanggal selesai (inklusif), dihitung tahun / bulan / hari", () => {
  it("sama dengan contoh form: 14 Mar – 13 Apr 2025 = 1 bulan", () => {
    expect(loanSpan("2025-03-14", "2025-04-13")).toEqual({ years: 0, months: 1, days: 0 });
    expect(formatLoanDuration("2025-03-14", "2025-04-13")).toBe("1 bulan");
  });

  it("tahun, bulan, hari; bagian nol tidak ditulis", () => {
    expect(formatLoanDuration("2026-11-20", "2026-12-03")).toBe("14 hari");
    expect(formatLoanDuration("2026-11-20", "2026-11-20")).toBe("1 hari"); // mulai = selesai
    expect(formatLoanDuration("2026-11-17", "2026-12-31")).toBe("1 bulan 15 hari");
    expect(formatLoanDuration("2026-11-17", "2027-11-16")).toBe("1 tahun");
    expect(formatLoanDuration("2026-11-17", "2028-01-21")).toBe("1 tahun 2 bulan 5 hari");
    expect(loanSpan("2026-12-20", "2027-03-19")).toEqual({ years: 0, months: 3, days: 0 }); // lintas tahun
  });

  it("tanggal yang tidak ada di bulan tujuan dijepit ke akhir bulan", () => {
    expect(addMonthsIso("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsIso("2028-01-31", 1)).toBe("2028-02-29"); // kabisat
    expect(formatLoanDuration("2026-01-31", "2026-02-28")).toBe("1 bulan 1 hari");
    expect(formatLoanDuration("2026-03-01", "2026-03-31")).toBe("1 bulan");
  });

  it("tanggal selesai bawaan 1 bulan, paling lambat 2 tahun", () => {
    expect(defaultLoanEnd("2025-03-14")).toBe("2025-04-13");
    expect(maxLoanEnd("2026-11-17")).toBe("2028-11-16");
    expect(formatLoanDuration("2026-11-17", maxLoanEnd("2026-11-17"))).toBe("2 tahun");
  });
});
describe("nomor Product Trial Form", () => {
  it("NNN/AMI-PTF/<bulan Romawi>/<tahun>", () => {
    expect(formatTrialFormNumber(8, 3, 2025)).toBe("008/AMI-PTF/III/2025");
    expect(formatTrialFormNumber(1, 11, 2026)).toBe("001/AMI-PTF/XI/2026");
    expect(formatTrialFormNumber(1234, 12, 2026)).toBe("1234/AMI-PTF/XII/2026");
    expect(romanMonth(9)).toBe("IX");
    expect(() => romanMonth(13)).toThrow();
  });

  it("urutan & tahun dibaca kembali dari nomor", () => {
    expect(parseTrialFormNumber("008/AMI-PTF/III/2025")).toEqual({ sequence: 8, year: 2025 });
    expect(parseTrialFormNumber("RMB/2026/01/0001")).toBeNull();
  });
});

describe("Hardware Admission Form (Tahap 16.5)", () => {
  it("nomor NNN/AMI-HAF//<tahun> — segmen tengah dikosongkan dulu (keputusan user 2026-11-18)", () => {
    expect(formatHafNumber(1, 2026)).toBe("001/AMI-HAF//2026");
    expect(formatHafNumber(1234, 2027)).toBe("1234/AMI-HAF//2027");
    expect(parseHafNumber("001/AMI-HAF//2026")).toEqual({ sequence: 1, year: 2026 });
    // Bila nanti segmen tengah diisi, nomor lama & baru tetap terbaca.
    expect(parseHafNumber("012/AMI-HAF/SFP/2025")).toEqual({ sequence: 12, year: 2025 });
    expect(parseHafNumber("001/AMI-PTF/XI/2026")).toBeNull();
  });

  it("form pengembalian: kondisi wajib, catatan wajib bila Rusak / Tidak lengkap, rak & posisi berpasangan", () => {
    const item = { itemId: "i1", condition: "GOOD", note: "", rackId: "r1", rackPosition: " b3 " };
    const parse = (overrides: Record<string, unknown>) => returnDemoLoanSchema.safeParse({ returnedAt: "2026-11-18", returnedByName: "", note: "", items: [{ ...item, ...overrides }] });
    expect(parse({}).data).toMatchObject({ returnedByName: null, note: null, items: [{ condition: "GOOD", note: null, rackId: "r1", rackPosition: "B3" }] });
    expect(parse({ condition: "" }).error?.issues[0]).toMatchObject({ path: ["items", 0, "condition"], message: "Pilih kondisi unit" });
    expect(parse({ condition: "DAMAGED" }).error?.issues[0]).toMatchObject({ path: ["items", 0, "note"], message: "Tulis kerusakan / kekurangannya" });
    expect(parse({ condition: "INCOMPLETE", note: "Kabel power tidak ada" }).success).toBe(true);
    expect(parse({ rackPosition: "" }).error?.issues[0]).toMatchObject({ path: ["items", 0, "rackPosition"], message: "Posisi di rak wajib dipilih" });
    expect(parse({ rackId: "", rackPosition: "" }).data?.items[0]).toMatchObject({ rackId: null, rackPosition: null }); // tidak disimpan di rak
    expect(RETURN_CONDITION_ENGLISH).toEqual({ GOOD: "Good", DAMAGED: "Damaged", INCOMPLETE: "Incomplete" });
  });
});

it("kegunaan 'Lainnya' memakai detail isian pengaju; kepemilikan unit", () => {
  expect(loanPurposeText("POC", "abaikan")).toBe("POC");
  expect(loanPurposeText("OTHER", " Unit pameran ")).toBe("Unit pameran");
  expect(loanPurposeText("OTHER", null)).toBe("Lainnya");
  expect(loanPurposeDescription("OTHER", "Unit pameran")).toBe("Unit pameran");
  expect(ownershipText("AMI", "abaikan")).toBe("Milik AMI");
  expect(ownershipText("PRINCIPAL", "Cisco")).toBe("Principal · Cisco");
  expect(ownershipText("DISTRIBUTOR", "PT Datascrip")).toBe("Distributor · PT Datascrip");

  const asset = { deviceName: "SFP+ (10G)", serialNo: "ABC123", category: "DEMO_UNIT" };
  expect(assetSchema.parse(asset)).toMatchObject({ ownership: "AMI", ownerName: null }); // bawaan milik AMI
  expect(assetSchema.safeParse({ ...asset, ownership: "PRINCIPAL", ownerName: "" }).error?.issues[0].message).toBe("Nama principal wajib diisi");
  expect(assetSchema.parse({ ...asset, ownership: "DISTRIBUTOR", ownerName: " PT Datascrip " })).toMatchObject({ ownerName: "PT Datascrip" });
});

it("teks form cetak berbahasa Inggris seperti form kertas", () => {
  expect(formatEnglishDate("2025-03-14")).toBe("14 March 2025");
  expect(formatTrialPeriod("2025-03-14", "2025-04-13")).toBe("1 Month (13 April 2025)");
  expect(formatTrialPeriod("2026-11-20", "2026-12-03")).toBe("14 Days (3 December 2026)");
  expect(formatTrialPeriod("2026-11-17", "2028-01-21")).toBe("1 Year 2 Months 5 Days (21 January 2028)");
  expect(formatTrialPeriod("2026-11-17", "2026-11-17")).toBe("1 Day (17 November 2026)");
});

it("unit dikelompokkan per part number untuk tabel form (urutan kemunculan)", () => {
  const items = [
    { deviceName: "SFP+ (10G)", serialNo: "A1" },
    { deviceName: "Switch 24", serialNo: "S1" },
    { deviceName: "SFP+ (10G)", serialNo: "A2" },
  ];
  expect(groupLoanItems(items)).toEqual([
    { deviceName: "SFP+ (10G)", serials: ["A1", "A2"] },
    { deviceName: "Switch 24", serials: ["S1"] },
  ]);
});

describe("validasi form pengajuan", () => {
  const base = {
    purpose: "POC",
    assetIds: ["a1", "a2"],
    borrowerName: "  PT Maju Jaya ",
    picName: "Bapak Surahman",
    picEmail: " PIC@Maju.co.id ",
    salesPersonId: "emp-1",
    startDate: "2026-11-20",
    dueDate: "2026-12-19",
    remarks: "",
  };

  it("menerima isian lengkap & merapikan teks", () => {
    expect(demoLoanSchema.parse(base)).toMatchObject({ borrowerName: "PT Maju Jaya", picEmail: "pic@maju.co.id", dueDate: "2026-12-19", remarks: null });
  });

  it("menolak unit ganda, tanpa unit, tanggal selesai sebelum mulai / lebih dari 2 tahun", () => {
    const issues = (values: object) => demoLoanSchema.safeParse({ ...base, ...values }).error?.issues.map((issue) => issue.message) ?? [];
    expect(issues({ assetIds: ["a1", "a1"] })).toContain("Ada unit yang terpilih dua kali");
    expect(issues({ assetIds: [] })).toContain("Pilih minimal 1 unit");
    expect(issues({ dueDate: "2026-11-19" })).toContain("Tanggal selesai tidak boleh sebelum tanggal mulai");
    expect(issues({ dueDate: "2026-11-20" })).toEqual([]); // 1 hari
    expect(issues({ dueDate: "2028-11-19" })).toEqual([]); // tepat 2 tahun
    expect(issues({ dueDate: "2028-11-20" })).toContain("Jangka pinjam maksimal 2 tahun");
    expect(issues({ dueDate: "" })).toContain("Tanggal tidak valid");
    expect(issues({ picEmail: "bukan-email" })).toContain("Format email tidak valid");
    expect(issues({ purpose: "OTHER" })).toContain("Tulis detail kegunaannya");
    expect(issues({ purpose: "OTHER", purposeDetail: "Unit pameran" })).toEqual([]);
  });
});

it("kunci antrian Operational diterima validator lonceng", () => {
  expect(NOTIFICATION_KEY.test("loanqueue")).toBe(true);
  expect(NOTIFICATION_KEY.test("loanqueue:extra")).toBe(false);
  expect(NOTIFICATION_KEY.test("loanrejected:cmabc123:1763370000000")).toBe(false); // "ditolak" kini lewat approval engine
});

describe("peringatan jatuh tempo & perpanjangan (Tahap 16.4)", () => {
  // Pinjam 20 Nov – 19 Des 2026.
  const stage = (today: string, start = "2026-11-20", due = "2026-12-19") => dueReminderStage(start, due, today);

  it("tahap email: H-7, H-1 (juga hari H), terlambat H+1 lalu tiap 7 hari", () => {
    expect(stage("2026-12-11")).toBeNull();
    expect(stage("2026-12-12")).toBe(-7);
    expect(stage("2026-12-17")).toBe(-7);
    expect(stage("2026-12-18")).toBe(-1);
    expect(stage("2026-12-19")).toBe(-1);
    expect(stage("2026-12-20")).toBe(1);
    expect(stage("2026-12-26")).toBe(1);
    expect(stage("2026-12-27")).toBe(8);
    expect(stage("2027-01-03")).toBe(15);
  });

  it("jangka pendek: H-7 dilewati bila jatuh sebelum tanggal mulai", () => {
    expect(stage("2026-12-15", "2026-12-15", "2026-12-19")).toBeNull();
    expect(stage("2026-12-18", "2026-12-15", "2026-12-19")).toBe(-1);
    expect(stage("2026-12-19", "2026-12-19", "2026-12-19")).toBe(-1);
    expect(stage("2026-12-12", "2026-12-12", "2026-12-19")).toBe(-7);
  });

  it("label & tahap lonceng", () => {
    expect([dueLabel(5), dueLabel(1), dueLabel(0), dueLabel(-3)]).toEqual(["5 hari lagi", "besok", "hari ini", "terlambat 3 hari"]);
    expect([dueNotificationStage(8), dueNotificationStage(7), dueNotificationStage(0)]).toEqual([null, "soon", "soon"]);
    expect([dueNotificationStage(-1), dueNotificationStage(-7), dueNotificationStage(-8)]).toEqual(["overdue-0", "overdue-0", "overdue-1"]);
    expect(daysUntilDue("2026-12-19", "2026-12-12")).toBe(7);
    expect(NOTIFICATION_KEY.test("loandue:cmabc123:2026-12-19:soon")).toBe(true);
    expect(NOTIFICATION_KEY.test("loandue:cmabc123:2026-12-19:overdue-12")).toBe(true);
    expect(NOTIFICATION_KEY.test("loandue:cmabc123:2026-12-19:later")).toBe(false);
    expect(NOTIFICATION_KEY.test("loandue:cm abc:2026-12-19:soon")).toBe(false);
  });

  it("batas tanggal perpanjangan", () => {
    const base = { startIso: "2026-11-20", currentDueIso: "2026-12-19", todayIso: "2026-12-12" };
    expect(extensionDueError({ ...base, newDueIso: "2027-01-19" })).toBeNull();
    expect(extensionDueError({ ...base, newDueIso: "2026-12-19" })).toBe("Tanggal selesai baru harus setelah jatuh tempo sekarang");
    expect(extensionDueError({ ...base, todayIso: "2026-12-25", newDueIso: "2026-12-22" })).toBe("Tanggal selesai baru tidak boleh sebelum hari ini");
    expect(extensionDueError({ ...base, newDueIso: "2028-11-19" })).toBeNull();
    expect(extensionDueError({ ...base, newDueIso: "2028-11-20" })).toBe("Jangka pinjam maksimal 2 tahun sejak tanggal mulai");
  });
});

describe("kebersihan header email (Tahap 16.4)", () => {
  it("subjek satu baris tanpa karakter kontrol, dipotong 200 karakter", () => {
    expect(safeSubject("[Pengingat] PT A\r\nBcc: x@y.z\t\u0000")).toBe("[Pengingat] PT A Bcc: x@y.z");
    expect(safeSubject("a b")).toBe("a b");
    expect(safeSubject("x".repeat(300))).toHaveLength(200);
  });

  it("alamat harus satu alamat polos", () => {
    expect(isSingleAddress("devi@artha-mitra.local")).toBe(true);
    expect(isSingleAddress("ami.zoom@arthamitra.co.id")).toBe(true);
    for (const bad of ["a@b.c, x@y.z", "a@b.c;x@y.z", "Devi <devi@a.b>", "a@b.c\r\nBcc: x@y.z", "a b@c.d", "tanpa-at", "a@b"]) {
      expect(isSingleAddress(bad)).toBe(false);
    }
  });
});
