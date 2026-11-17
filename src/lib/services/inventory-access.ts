// Siapa yang boleh memakai Inventory & unit demo (2026-11-17):
// - melihat (stok, lokasi, peminjaman): Admin, Operational, dan karyawan aktif divisi Engineer / Sales
// - mengelola (daftar/ubah/hapus unit, posisi rak): Admin & Operational
// Operational = user yang dipilih Admin di Setting → Inventaris & Rak (role apa pun); mereka juga menyiapkan
// peminjaman yang sudah disetujui (approval Ko Yosep) & menerima peringatan jatuh tempo.
import type { Prisma, PrismaClient, Role } from "@/generated/prisma/client";
import { INVENTORY_DIVISIONS } from "@/lib/inventory";
import type { OperationalUsersInput } from "@/lib/validators/inventory";
import { logAudit } from "./audit";
import { ServiceError } from "./errors";

type Db = PrismaClient | Prisma.TransactionClient;

export const OPERATIONAL_USERS_KEY = "inventory.operationalUserIds";

export async function getOperationalUserIds(db: Db): Promise<string[]> {
  const value = (await db.appSetting.findUnique({ where: { key: OPERATIONAL_USERS_KEY } }))?.value;
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

/** Simpan daftar Operational (Admin). Hanya user aktif; urutan & duplikat dirapikan. */
export async function saveOperationalUsers(db: PrismaClient, actorId: string, input: OperationalUsersInput): Promise<void> {
  const ids = [...new Set(input.userIds)];
  await db.$transaction(async (tx) => {
    const users = await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, isActive: true } });
    if (users.length !== ids.length) throw new ServiceError("Ada user yang tidak ditemukan", "userIds");
    if (users.some((user) => !user.isActive)) throw new ServiceError("Hanya user aktif yang bisa menjadi Operational", "userIds");
    const before = await getOperationalUserIds(tx);
    await tx.appSetting.upsert({ where: { key: OPERATIONAL_USERS_KEY }, create: { key: OPERATIONAL_USERS_KEY, value: ids }, update: { value: ids } });
    await logAudit(tx, { actorId, action: "UPDATE", entity: "AppSetting", entityId: OPERATIONAL_USERS_KEY, before, after: ids });
  });
}

export type InventoryAccess = {
  /** Boleh membuka menu & halaman Inventory. */
  canView: boolean;
  /** Boleh mendaftarkan / mengubah / menghapus unit dan mengatur posisi rak. */
  canManage: boolean;
  isOperational: boolean;
};

export async function inventoryAccess(db: Db, user: { id: string; role: Role; employeeId: string | null }): Promise<InventoryAccess> {
  const [operationalIds, employee] = await Promise.all([
    getOperationalUserIds(db),
    user.employeeId ? db.employee.findUnique({ where: { id: user.employeeId }, select: { status: true, division: true } }) : null,
  ]);
  const isAdmin = user.role === "ADMIN";
  const isOperational = operationalIds.includes(user.id);
  const inDivision = employee?.status === "ACTIVE" && INVENTORY_DIVISIONS.includes(employee.division);
  return { canView: isAdmin || isOperational || inDivision, canManage: isAdmin || isOperational, isOperational };
}
