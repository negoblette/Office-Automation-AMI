import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildApproval, rejectRequest } from "@/lib/services/approval";
import { deleteCertificate } from "@/lib/services/certificate";
import { getNotifications } from "@/lib/services/notifications";
import { testDb } from "@/test/db";
import { createApprovalEntity } from "@/test/entities";
import { resetAndSeed } from "@/test/seed";

let u: Record<string, string>;
const TODAY = "2026-10-13";
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

beforeEach(async () => {
  u = await resetAndSeed();
});

afterAll(async () => {
  await testDb.$disconnect();
});

const actor = async (key: string) => {
  const user = await testDb.user.findUniqueOrThrow({ where: { id: u[key] } });
  return { id: user.id, role: user.role, employeeId: user.employeeId };
};

describe("lonceng notifikasi (2026-10-13)", () => {
  it("staf: dokumen akan habis + pengajuan ditolak; approver: antrian; Admin: dokumen semua karyawan", async () => {
    const andi = await actor("andi");
    await testDb.document.create({
      data: {
        ownerType: "EMPLOYEE",
        employeeId: andi.employeeId!,
        docType: "SIM",
        fileKey: `${randomUUID()}.pdf`,
        fileName: "sim.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        validUntil: d("2026-10-20"),
        uploadedById: andi.id,
      },
    });
    const entityId = await createApprovalEntity("REIMBURSE", u.andi);
    const { requestId } = await testDb.$transaction((tx) => buildApproval(tx, { module: "REIMBURSE", entityId, entityNumber: "RMB/2026/10/0009", requesterId: u.andi }));

    // Ko Yosep (Approver L1) melihat antrian.
    expect((await getNotifications(testDb, await actor("yosep"), TODAY)).map((n) => n.title)).toEqual(["1 pengajuan menunggu persetujuan Anda"]);

    await rejectRequest(testDb, { requestId, actorId: u.yosep, reason: "Kurang lengkap" });
    const mine = await getNotifications(testDb, andi, TODAY);
    expect(mine.map((n) => [n.kind, n.title, n.tone])).toEqual([
      ["rejected", "Reimburse RMB/2026/10/0009 ditolak", "danger"],
      ["expiry", "SIM A/C berakhir 7 hari lagi", "danger"],
    ]);
    // Admin melihat dokumen semua karyawan; Sinta tidak melihat milik Andi.
    expect((await getNotifications(testDb, await actor("ika"), TODAY)).some((n) => n.kind === "expiry" && n.detail.includes("Andi Pratama"))).toBe(true);
    expect(await getNotifications(testDb, await actor("sinta"), TODAY)).toEqual([]);

    // Sertifikat yang dihapus pemohon (verifikasi dibatalkan) bukan notifikasi "ditolak".
    const certId = await createApprovalEntity("CERTIFICATE", u.andi);
    await testDb.$transaction((tx) => buildApproval(tx, { module: "CERTIFICATE", entityId: certId, entityNumber: "CRT/2026/10/0009", requesterId: u.andi }));
    await deleteCertificate(testDb, andi, certId);
    expect((await getNotifications(testDb, andi, TODAY)).filter((n) => n.kind === "rejected")).toHaveLength(1);
  });
});
