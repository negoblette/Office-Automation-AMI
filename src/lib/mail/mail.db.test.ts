import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApprovalEmails } from "@/lib/mail/approval-emails";
import type { EmailJobData } from "@/lib/mail/queue";
import { renderEmail } from "@/lib/mail/render";
import type { ApprovalEmailProps } from "@/lib/mail/templates/approval-email";
import { type MailTransport, processEmailJob } from "@/lib/mail/send-email";
import { approveRequest, buildApproval } from "@/lib/services/approval";
import { testDb } from "@/test/db";
import { createApprovalEntity } from "@/test/entities";
import { submitLeaveRequest } from "@/lib/services/leave";
import { leaveRequestSchema } from "@/lib/validators/leave";
import { resetAndSeed } from "@/test/seed";

let u: Record<string, string>;

beforeEach(async () => {
  u = await resetAndSeed();
});

afterAll(async () => {
  await testDb.$disconnect();
});

const submitAndi = async () => {
  const entityId = await createApprovalEntity("REIMBURSE", u.andi);
  return testDb.$transaction((tx) =>
    buildApproval(tx, { module: "REIMBURSE", entityId, entityNumber: "RMB/2026/09/0007", requesterId: u.andi }),
  );
};

describe("buildApprovalEmails (NTF-01..03)", () => {
  it("submit → email ke approver L1 dengan link ke /approval", async () => {
    const { notifications } = await submitAndi();
    const emails = await buildApprovalEmails(testDb, notifications[0]);
    expect(emails).toEqual([
      {
        to: "yosep@artha-mitra.local",
        subject: "[Approval] Reimburse RMB/2026/09/0007 dari Andi Pratama",
        template: "approval-requested",
        props: expect.objectContaining({
          recipientName: "Yosep",
          requesterName: "Andi Pratama",
          statusLine: "Menunggu persetujuan Anda (level 1).",
          url: expect.stringMatching(/\/approval$/),
        }),
      },
    ]);
  });

  it("approve L1 → approver L2 + info progres ke pemohon; approve final → pemohon + semua Admin", async () => {
    const { requestId } = await submitAndi();
    const step1 = await approveRequest(testDb, { requestId, actorId: u.yosep });
    const [toRudy, toAndi] = await Promise.all(step1.notifications.map((n) => buildApprovalEmails(testDb, n)));
    expect(toRudy.map((e) => e.to)).toEqual(["rudy@artha-mitra.local"]);
    expect(toAndi[0]).toMatchObject({
      to: "andi@artha-mitra.local",
      subject: "[Diproses] Reimburse RMB/2026/09/0007",
      props: { statusLine: "Disetujui L1 oleh Yosep, menunggu persetujuan L2." },
    });

    const final = await approveRequest(testDb, { requestId, actorId: u.rudy });
    const finalEmails = await buildApprovalEmails(testDb, final.notifications[0]);
    expect(finalEmails.map((e) => e.to).sort()).toEqual(
      ["andi", "ika", "leonard", "rudy"].map((k) => `${k}@artha-mitra.local`), // Admin = Ika, Rudy, Leonard
    );
    expect(finalEmails[0]).toMatchObject({ subject: "[Disetujui] Reimburse RMB/2026/09/0007", props: { statusLine: "Disetujui final oleh Rudy." } });
  });
});

describe("rincian pengajuan di email (2026-10-12)", () => {
  it("pengajuan cuti → email ke approver memuat tanggal, jumlah hari, dan alasan", async () => {
    const andi = await testDb.user.findUniqueOrThrow({ where: { id: u.andi } });
    const result = await submitLeaveRequest(
      testDb,
      { id: andi.id, role: andi.role, employeeId: andi.employeeId },
      leaveRequestSchema.parse({ startDate: "2026-10-05", endDate: "2026-10-06", reason: "Acara keluarga" }),
    );
    const [email] = await buildApprovalEmails(testDb, result.notifications[0]);
    const props = email.props as ApprovalEmailProps;
    expect(email.to).toBe("rudy@artha-mitra.local");
    expect(props.details).toEqual(["Jenis: Cuti tahunan", "Tanggal cuti: 5 Oktober 2026 – 6 Oktober 2026 (2 hari kerja)", "Alasan: Acara keluarga"]);
    const { text } = await renderEmail("approval-requested", props);
    expect(text).toContain("Alasan: Acara keluarga");
  });
});

describe("renderEmail", () => {
  it("HTML & teks berisi nomor dokumen, ringkasan, dan link", async () => {
    const { html, text } = await renderEmail("approval-requested", {
      template: "approval-requested",
      recipientName: "Yosep",
      requesterName: "Andi Pratama",
      moduleLabel: "Reimburse",
      entityNumber: "RMB/2026/09/0007",
      statusLine: "Menunggu persetujuan Anda (level 1).",
      url: "http://localhost:3000/approval",
    });
    expect(html).toContain("RMB/2026/09/0007");
    expect(html).toContain('href="http://localhost:3000/approval"');
    expect(text).toContain("Halo Yosep");
    expect(text.toLowerCase()).toContain("pengajuan menunggu persetujuan anda");
  });

  it("security-notice (hardening Tahap 5): judul, waktu, IP, dan peringatan bila bukan pemilik akun", async () => {
    const { text } = await renderEmail("security-notice", {
      recipientName: "Ika",
      title: "MFA akun Anda di-reset Admin",
      message: "MFA akun Anda di-reset oleh Leonard.",
      when: "20 Okt 2026, 09:00 WIB",
      ip: "10.0.0.5",
      url: "http://localhost:3000/mfa",
    });
    expect(text.toLowerCase()).toContain("mfa akun anda di-reset admin");
    expect(text).toContain("Alamat IP: 10.0.0.5");
    expect(text).toContain("Bukan Anda yang melakukannya?");
  });

  it("security-alert (hardening Tahap 6): rincian alarm & saran tindakan untuk Admin", async () => {
    const { text } = await renderEmail("security-alert", {
      recipientName: "Rudy",
      title: "Akses data besar-besaran oleh Yosep",
      message: "Sistem mendeteksi aktivitas yang perlu diperiksa:",
      when: "21 Okt 2026, 09:00 WIB",
      ip: null,
      url: "http://localhost:3000/setting/user",
      details: ["52 unduhan file / export / buka data pribadi dalam 1 jam terakhir.", "IP: 10.1.2.3"],
    });
    expect(text).toContain("52 unduhan file");
    expect(text).toContain("IP: 10.1.2.3");
    expect(text).toContain("Periksa aktivitas ini di audit log");
  });
});

describe("processEmailJob", () => {
  async function job(): Promise<EmailJobData> {
    const log = await testDb.emailLog.create({ data: { to: "yosep@artha-mitra.local", subject: "Uji", template: "approval-final" } });
    return {
      emailLogId: log.id,
      to: log.to,
      subject: log.subject,
      template: "approval-final",
      props: {
        template: "approval-final",
        recipientName: "Yosep",
        requesterName: "Rudy",
        moduleLabel: "Cuti",
        entityNumber: "LV/2026/09/0001",
        statusLine: "Disetujui otomatis.",
        url: "http://localhost:3000/cuti",
      },
    };
  }

  it("sukses → EmailLog SENT", async () => {
    const sent: unknown[] = [];
    const transport = { sendMail: async (mail: unknown) => sent.push(mail) } as unknown as MailTransport;
    const data = await job();
    await processEmailJob(testDb, transport, data);
    expect(sent).toHaveLength(1);
    expect(await testDb.emailLog.findUniqueOrThrow({ where: { id: data.emailLogId } })).toMatchObject({ status: "SENT", error: null });
  });

  it("gagal → EmailLog FAILED + error dilempar (supaya pg-boss retry)", async () => {
    const transport = { sendMail: async () => { throw new Error("SMTP mati"); } } as unknown as MailTransport;
    const data = await job();
    await expect(processEmailJob(testDb, transport, data)).rejects.toThrow("SMTP mati");
    expect(await testDb.emailLog.findUniqueOrThrow({ where: { id: data.emailLogId } })).toMatchObject({ status: "FAILED", error: "SMTP mati" });
  });
});
