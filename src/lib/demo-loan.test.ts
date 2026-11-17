import { describe, expect, it } from "vitest";
import {
  addMonthsIso,
  formatEnglishDate,
  formatLoanDuration,
  formatTrialPeriod,
  formatTrialFormNumber,
  groupLoanItems,
  defaultLoanEnd,
  loanSpan,
  maxLoanEnd,
  loanPurposeDescription,
  loanPurposeText,
  parseTrialFormNumber,
  romanMonth,
} from "@/lib/demo-loan";
import { ownershipText } from "@/lib/inventory";
import { assetSchema } from "@/lib/validators/asset";
import { demoLoanSchema } from "@/lib/validators/demo-loan";
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
