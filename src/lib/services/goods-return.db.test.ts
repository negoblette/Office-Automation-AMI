// Barang pinjaman principal / distributor (2026-11-20, keputusan user): milik AMI untuk sementara saat dipinjamkan ke
// customer (nomor PTF "AMI", boleh dicampur unit AMI), dan dikembalikan per unit lewat Hardware Admission Form.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addDaysIso } from "@/lib/demo-loan";
import { toJakartaIsoDate } from "@/lib/format";
import { createAsset } from "@/lib/services/asset";
import { assetHistory } from "@/lib/services/asset-history";
import { listAssets } from "@/lib/services/asset-queries";
import { submitDemoLoan } from "@/lib/services/demo-loan";
import { getGoodsReceipt, getGoodsReturn, listGoodsReceipts } from "@/lib/services/goods-receipt-queries";
import { receiveGoods, returnGoods } from "@/lib/services/goods-receipt";
import { saveOperationalUsers } from "@/lib/services/inventory-access";
import { assetSchema } from "@/lib/validators/asset";
import { demoLoanSchema } from "@/lib/validators/demo-loan";
import { goodsReceiptSchema, goodsReturnSchema } from "@/lib/validators/goods-receipt";
import { testDb } from "@/test/db";
import { resetAndSeed } from "@/test/seed";

let u: Record<string, string>;
let emp: Record<string, string>;

const TODAY = toJakartaIsoDate();
const YESTERDAY = addDaysIso(TODAY, -1);

beforeEach(async () => {
  u = await resetAndSeed();
  const users = await testDb.user.findMany({ select: { id: true, employeeId: true } });
  emp = Object.fromEntries(Object.entries(u).map(([key, id]) => [key, users.find((user) => user.id === id)?.employeeId ?? ""]));
  await saveOperationalUsers(testDb, u.ika, { userIds: [u.devi] });
});

afterAll(async () => {
  await testDb.$disconnect();
});

const actor = async (key: string) => {
  const user = await testDb.user.findUniqueOrThrow({ where: { id: u[key] } });
  return { id: user.id, role: user.role, employeeId: user.employeeId };
};

const receive = async (serials: string[], receivedDate = YESTERDAY) =>
  receiveGoods(
    testDb,
    await actor("devi"),
    goodsReceiptSchema.parse({
      ownership: "PRINCIPAL",
      ownerName: "Cisco",
      contactName: "Sakil",
      receivedDate,
      picId: emp.andi,
      receiverId: emp.devi,
      units: serials.map((serialNo) => ({ deviceName: `Cisco ${serialNo}`, serialNo, category: "DEMO_UNIT" })),
    }),
    TODAY,
  );

const returnInput = (assetIds: string[], overrides: Record<string, unknown> = {}) =>
  goodsReturnSchema.parse({ assetIds, returnedDate: TODAY, contactName: "Sakil", returnedById: emp.devi, receivedByName: "Budi Cisco", note: "Lengkap", ...overrides });

const assetIdOf = async (serialNo: string) => (await testDb.asset.findUniqueOrThrow({ where: { serialNo } })).id;

describe("barang titipan principal dipinjamkan atas nama AMI", () => {
  it("satu form boleh campur unit AMI & titipan Cisco; nomor PTF memakai AMI", async () => {
    await receive(["CS001"]);
    const ami = await createAsset(testDb, u.ika, assetSchema.parse({ deviceName: "Switch AMI", serialNo: "AMI001", category: "DEMO_UNIT" }));
    const result = await submitDemoLoan(
      testDb,
      await actor("sinta"),
      demoLoanSchema.parse({
        purpose: "POC",
        assetIds: [ami.id, await assetIdOf("CS001")],
        borrowerName: "PT Bank Uji",
        contactName: "Bapak Uji",
        contactEmail: "uji@bank.test",
        picId: emp.sinta,
        startDate: TODAY,
        dueDate: addDaysIso(TODAY, 30),
      }),
      TODAY,
    );
    expect(result.number).toMatch(/^\d{3}\/AMI-PTF\/AMI\/\d{4}$/);
    expect((await testDb.demoLoan.findUniqueOrThrow({ where: { id: result.loanId } })).unitOwner).toBe("AMI");
  });
});

describe("pengembalian ke principal / distributor (2026-11-20)", () => {
  it("per unit: HAF terbit, unit keluar dari Daftar Unit, status penerimaan & riwayat tercatat", async () => {
    const receipt = await receive(["CS001", "CS002"]);
    const [first, second] = [await assetIdOf("CS001"), await assetIdOf("CS002")];

    const goodsReturn = await returnGoods(testDb, await actor("devi"), receipt.id, returnInput([first]), TODAY);
    expect(goodsReturn.hafNumber).toMatch(/^\d{3}\/AMI-HAF\/Cisco\/\d{4}$/);
    expect(goodsReturn.hafNumber).not.toBe(receipt.hafNumber);
    expect(await testDb.asset.findUniqueOrThrow({ where: { id: first } })).toMatchObject({ deletedAt: expect.any(Date), returnedToOwnerAt: expect.any(Date), rackId: null });
    expect((await listAssets(testDb)).map((asset) => asset.serialNo)).toEqual(["CS002"]);

    const detail = (await getGoodsReceipt(testDb, receipt.id))!;
    expect(detail).toMatchObject({ unitCount: 2, returnedCount: 1 });
    expect(detail.units.map((unit) => [unit.serialNo, unit.status.kind])).toEqual([
      ["CS001", "RETURNED"],
      ["CS002", "AVAILABLE"],
    ]);
    expect(detail.returns).toEqual([
      expect.objectContaining({ hafNumber: goodsReturn.hafNumber, returnedByName: "Devi", receivedByName: "Budi Cisco", units: [expect.objectContaining({ assetId: first, serialNo: "CS001" })] }),
    ]);
    expect((await listGoodsReceipts(testDb))[0]).toMatchObject({ unitCount: 2, returnedCount: 1 });
    expect((await getGoodsReturn(testDb, goodsReturn.id))!.receipt).toMatchObject({ ownerName: "Cisco", hafNumber: receipt.hafNumber });
    expect((await assetHistory(testDb, first)).map((event) => event.title)).toContain("Dikembalikan ke Principal Cisco");

    // Sisanya menyusul → penerimaan dikembalikan semua.
    await returnGoods(testDb, await actor("devi"), receipt.id, returnInput([second]), TODAY);
    expect(await getGoodsReceipt(testDb, receipt.id)).toMatchObject({ unitCount: 2, returnedCount: 2 });
  });

  it("aturan: hanya Operational, unit penerimaan itu & masih di AMI, tidak sedang dipinjam, tanggal wajar", async () => {
    const receipt = await receive(["CS001", "CS002"]);
    const other = await receive(["CS900"]);
    const [first, second] = [await assetIdOf("CS001"), await assetIdOf("CS002")];
    const devi = await actor("devi");

    await expect(returnGoods(testDb, await actor("ika"), receipt.id, returnInput([first]), TODAY)).rejects.toThrow("Hanya Operational");
    await expect(returnGoods(testDb, devi, receipt.id, returnInput([await assetIdOf("CS900")]), TODAY)).rejects.toThrow("bukan dari penerimaan ini");
    await expect(returnGoods(testDb, devi, receipt.id, returnInput([first], { returnedDate: addDaysIso(TODAY, 1) }), TODAY)).rejects.toThrow("masa depan");
    await expect(returnGoods(testDb, devi, receipt.id, returnInput([first], { returnedDate: addDaysIso(YESTERDAY, -1) }), TODAY)).rejects.toThrow("sebelum tanggal terima");

    // Sedang diajukan pinjam → belum bisa dikembalikan.
    await submitDemoLoan(
      testDb,
      await actor("sinta"),
      demoLoanSchema.parse({
        purpose: "POC",
        assetIds: [second],
        borrowerName: "PT Bank Uji",
        contactName: "Bapak Uji",
        contactEmail: "uji@bank.test",
        picId: emp.sinta,
        startDate: TODAY,
        dueDate: addDaysIso(TODAY, 30),
      }),
      TODAY,
    );
    await expect(returnGoods(testDb, devi, receipt.id, returnInput([first, second]), TODAY)).rejects.toThrow("Cisco CS002 (SN CS002)");
    expect((await getGoodsReceipt(testDb, receipt.id))!.units.find((unit) => unit.serialNo === "CS002")!.status).toMatchObject({ kind: "BUSY" });

    // Sudah dikembalikan → tidak bisa dikembalikan dua kali.
    await returnGoods(testDb, devi, receipt.id, returnInput([first]), TODAY);
    await expect(returnGoods(testDb, devi, receipt.id, returnInput([first]), TODAY)).rejects.toThrow("sudah dikembalikan");
    expect(other.id).toBeTruthy();
  });

  it("serial yang sudah dikembalikan lalu dipinjam AMI lagi: unit yang sama aktif lagi, riwayat menyambung", async () => {
    const receipt = await receive(["CS001"]);
    const assetId = await assetIdOf("CS001");
    await returnGoods(testDb, await actor("devi"), receipt.id, returnInput([assetId]), TODAY);

    const again = await receive(["CS001"], TODAY);
    expect(await testDb.asset.findUniqueOrThrow({ where: { serialNo: "CS001" } })).toMatchObject({ id: assetId, deletedAt: null, returnedToOwnerAt: null, receiptId: again.id });
    expect((await listAssets(testDb)).map((asset) => asset.id)).toEqual([assetId]);
    // Penerimaan lama tetap mencatat unit itu sebagai sudah dikembalikan.
    const old = (await getGoodsReceipt(testDb, receipt.id))!;
    expect(old).toMatchObject({ unitCount: 1, returnedCount: 1 });
    expect(old.units[0]).toMatchObject({ id: assetId, serialNo: "CS001", status: { kind: "RETURNED" } });
    expect((await getGoodsReceipt(testDb, again.id))!.units[0]).toMatchObject({ id: assetId, status: { kind: "AVAILABLE" } });
    expect((await assetHistory(testDb, assetId)).map((event) => event.title)).toEqual(
      expect.arrayContaining(["Diterima dari Principal Cisco", "Dikembalikan ke Principal Cisco", "Diterima lagi dari Principal Cisco"]),
    );
    // Serial unit aktif (belum dikembalikan) tetap ditolak.
    await expect(receive(["CS001"], TODAY)).rejects.toThrow("Serial number sudah terdaftar");
  });
});
