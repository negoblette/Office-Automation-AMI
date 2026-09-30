// Aturan akses bersama untuk data milik karyawan (dokumen, keluarga, sertifikat).
import type { Prisma, Role } from "@/generated/prisma/client";
import { ServiceError } from "./errors";
import { prismaFileAccessRepository } from "./file-access";

/** User yang melakukan aksi (dari `requireUser()`). */
export type Actor = { id: string; role: Role; employeeId: string | null };

/**
 * Admin boleh mengelola data siapa pun; staf hanya miliknya sendiri dan hanya selama
 * masih aktif. Mengembalikan data karyawan yang relevan.
 */
export async function getManageableEmployee(tx: Prisma.TransactionClient, actor: Actor, employeeId: string) {
  const isOwner = actor.employeeId === employeeId;
  if (actor.role !== "ADMIN" && !isOwner) throw new ServiceError("Anda tidak berhak mengubah data karyawan ini");

  const employee = await tx.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, status: true, maritalStatus: true },
  });
  if (!employee) throw new ServiceError("Karyawan tidak ditemukan");
  if (employee.status !== "ACTIVE" && actor.role !== "ADMIN") {
    throw new ServiceError("Data karyawan yang sudah resign tidak bisa diubah");
  }
  return employee;
}

/** Key file harus belum dipakai data lain — mencegah "mengklaim" file milik orang lain. */
export async function assertFileKeyAvailable(tx: Prisma.TransactionClient, fileKey: string) {
  const owner = await prismaFileAccessRepository(tx).findFileOwner(fileKey);
  if (owner) throw new ServiceError("File sudah dipakai, silakan upload ulang");
}
