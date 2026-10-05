// Daftar aset sederhana per karyawan (Fase 14, keputusan user 2026-10-05). Dicatat Admin,
// dilihat karyawan di Profil → Aset Saya. Bukan modul Inventory (masih ditunda).
import type { PrismaClient } from "@/generated/prisma/client";
import { fromIsoDate, toJakartaIsoDate } from "@/lib/format";
import type { EmployeeAssetInput } from "@/lib/validators/employee-asset";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";

export type EmployeeAssetView = {
  id: string;
  name: string;
  serialNo: string | null;
  receivedDate: string;
  returnedDate: string | null;
  note: string | null;
};

export async function listEmployeeAssetItems(db: PrismaClient, employeeId: string): Promise<EmployeeAssetView[]> {
  const assets = await db.employeeAsset.findMany({
    where: { employeeId, deletedAt: null },
    orderBy: [{ returnedDate: { sort: "desc", nulls: "first" } }, { receivedDate: "desc" }],
  });
  return assets.map((a) => ({
    id: a.id,
    name: a.name,
    serialNo: a.serialNo,
    receivedDate: toJakartaIsoDate(a.receivedDate),
    returnedDate: a.returnedDate ? toJakartaIsoDate(a.returnedDate) : null,
    note: a.note,
  }));
}

const dataOf = (input: EmployeeAssetInput) => ({
  name: input.name,
  serialNo: input.serialNo,
  receivedDate: fromIsoDate(input.receivedDate),
  returnedDate: input.returnedDate ? fromIsoDate(input.returnedDate) : null,
  note: input.note,
});

/** Tambah (`assetId` null) / ubah aset karyawan. Hanya Admin (dicek di action). */
export async function saveEmployeeAsset(db: PrismaClient, actorId: string, employeeId: string, assetId: string | null, input: EmployeeAssetInput) {
  return db.$transaction(async (tx) => {
    const employee = await tx.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
    if (!employee) throw new ServiceError("Karyawan tidak ditemukan");
    const before = assetId ? await tx.employeeAsset.findFirst({ where: { id: assetId, employeeId, deletedAt: null } }) : null;
    if (assetId && !before) throw new ServiceError("Aset tidak ditemukan");
    const after = before
      ? await tx.employeeAsset.update({ where: { id: before.id }, data: dataOf(input) })
      : await tx.employeeAsset.create({ data: { employeeId, ...dataOf(input) } });
    await logAudit(tx, { actorId, action: before ? "UPDATE" : "CREATE", entity: "EmployeeAsset", entityId: after.id, before, after });
    return after;
  });
}

export async function deleteEmployeeAsset(db: PrismaClient, actorId: string, assetId: string) {
  return db.$transaction(async (tx) => {
    const asset = await tx.employeeAsset.findFirst({ where: { id: assetId, deletedAt: null } });
    if (!asset) throw new ServiceError("Aset tidak ditemukan");
    await tx.employeeAsset.update({ where: { id: assetId }, data: { deletedAt: new Date() } }); // soft delete
    await logAudit(tx, { actorId, action: "DELETE", entity: "EmployeeAsset", entityId: assetId, before: asset });
  });
}
