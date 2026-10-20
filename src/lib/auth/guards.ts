import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { auth } from "./index";
import { canApprove } from "@/lib/roles";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  employeeId: string | null;
  /** true = wajib ganti password dulu (akun baru / habis di-reset Admin). */
  mustChangePassword: boolean;
};

/**
 * User yang sedang login, dibaca ulang dari database (bukan hanya dari token JWT),
 * supaya akun yang dinonaktifkan/di-resign, role yang diubah, atau password yang diganti
 * langsung berlaku. Di-cache per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      employeeId: true,
      sessionVersion: true,
      mustChangePassword: true,
      employee: { select: { fullName: true } },
    },
  });
  // Akun nonaktif, atau password sudah diganti/di-reset setelah token ini dibuat → sesi tidak berlaku.
  if (!user?.isActive || user.sessionVersion !== session.user.sessionVersion) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.employee?.fullName ?? user.email,
    role: user.role,
    employeeId: user.employeeId,
    mustChangePassword: user.mustChangePassword,
  };
});

/**
 * Wajib login. Dipakai di setiap page `(main)` dan Server Action. Akun yang wajib ganti
 * password diarahkan ke /ganti-password, kecuali halaman & aksi ganti password itu sendiri.
 */
export async function requireUser({ allowPasswordChange = false }: { allowPasswordChange?: boolean } = {}): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !allowPasswordChange) redirect("/ganti-password");
  return user;
}

/** Wajib role yang boleh menyetujui (ADMIN / APPROVER) — halaman & aksi Approval. */
export async function requireApprover(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!canApprove(user.role)) redirect("/akses-ditolak");
  return user;
}

/** Wajib role ADMIN. Staf diarahkan ke halaman "Akses ditolak". */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/akses-ditolak");
  return user;
}
