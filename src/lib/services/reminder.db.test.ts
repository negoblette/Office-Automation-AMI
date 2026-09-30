import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { renderEmail } from "@/lib/mail/render";
import { assetReminders, certificateReminders } from "@/lib/services/reminder";
import { testDb } from "@/test/db";
import { resetAndSeed } from "@/test/seed";

const TODAY = "2026-09-24";
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
let andiEmployeeId: string;

beforeEach(async () => {
  const users = await resetAndSeed();
  const andi = await testDb.user.findUniqueOrThrow({ where: { id: users.andi } });
  andiEmployeeId = andi.employeeId!;
});

afterAll(async () => {
  await testDb.$disconnect();
});

const cert = (name: string, endDate: string | null, employeeId = andiEmployeeId) =>
  testDb.certificate.create({
    data: { employeeId, type: "PROFESSIONAL", name, startDate: d("2024-01-01"), endDate: endDate ? d(endDate) : null },
  });

describe("certificateReminders (CERT-03)", () => {
  it("sertifikat berakhir ≤ 30 hari → email ke karyawan + semua Admin, sekali saja", async () => {
    await cert("CCNA", "2026-10-24"); // tepat H-30
    await cert("Lama", "2026-09-23"); // sudah lewat
    await cert("Jauh", "2026-10-25"); // H-31
    await cert("Seumur hidup", null);

    const emails = await certificateReminders(testDb, TODAY);
    expect(emails.map((e) => e.to).sort()).toEqual(
      [
        "andi@artha-mitra.local",
        "darwin@artha-mitra.local",
        "ika@artha-mitra.local",
        "leonard@artha-mitra.local",
        "rudy@artha-mitra.local",
        "yosep@artha-mitra.local",
      ].sort(),
    );
    const toAndi = emails.find((e) => e.to === "andi@artha-mitra.local")!;
    expect(toAndi.subject).toBe("[Reminder] Sertifikat Profesional CCNA berakhir 30 hari lagi");
    expect(toAndi.props.url).toMatch(/\/profil\/sertifikat$/);
    expect(emails.find((e) => e.to === "yosep@artha-mitra.local")!.props.url).toMatch(`/karyawan/${andiEmployeeId}?tab=sertifikat`);

    // Hari berikutnya: CCNA tidak dikirim ulang; "Jauh" baru masuk H-30.
    const next = await certificateReminders(testDb, "2026-09-25");
    expect(new Set(next.map((e) => e.props.itemName))).toEqual(new Set(["Jauh"]));
    expect(await certificateReminders(testDb, "2026-09-26")).toEqual([]);
  });

  it("worker sempat mati: item yang tinggal 5 hari tetap di-reminder; diperpanjang → reminder baru", async () => {
    const c = await cert("CCNA", "2026-09-29");
    const first = await certificateReminders(testDb, TODAY);
    expect(first[0].props.daysLeft).toBe(5);
    await testDb.certificate.update({ where: { id: c.id }, data: { endDate: d("2026-10-10") } });
    expect(await certificateReminders(testDb, TODAY)).not.toEqual([]);
  });

  it("karyawan resign tidak di-reminder", async () => {
    await cert("CCNA", "2026-10-01");
    await testDb.employee.update({ where: { id: andiEmployeeId }, data: { status: "RESIGNED" } });
    expect(await certificateReminders(testDb, TODAY)).toEqual([]);
  });

  it("template reminder-expiry ter-render", async () => {
    await cert("CCNA", "2026-10-01");
    const [email] = await certificateReminders(testDb, TODAY);
    const { html, text } = await renderEmail(email.template, email.props);
    expect(html).toContain("CCNA");
    expect(text.toLowerCase()).toContain("berakhir 7 hari lagi");
  });
});

describe("assetReminders (INV-04)", () => {
  it("support & garansi berakhir ≤ 30 hari → email ke Admin saja, per jenis", async () => {
    await testDb.asset.create({
      data: { deviceName: "Router X", serialNo: "SN1", category: "DEMO_UNIT", supportEnd: d("2026-10-01"), warrantyEnd: d("2026-10-20") },
    });
    await testDb.asset.create({ data: { deviceName: "Switch Y", serialNo: "SN2", category: "DEMO_UNIT", supportEnd: d("2027-01-01") } });
    const emails = await assetReminders(testDb, TODAY);
    expect(emails).toHaveLength(10); // 2 item × 5 Admin
    expect(new Set(emails.map((e) => e.props.itemKind))).toEqual(new Set(["Periode support unit", "Garansi unit"]));
    expect(emails.every((e) => e.to !== "andi@artha-mitra.local")).toBe(true);
    expect(await assetReminders(testDb, TODAY)).toEqual([]);
  });
});
