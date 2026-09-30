import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { auth } from "./index";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  employeeId: string | null;
};

/**
 * User yang sedang login, dibaca ulang dari database (bukan hanya dari token JWT),
 * supaya akun yang dinonaktifkan/di-resign atau role yang diubah langsung berlaku.
 * Di-cache per request.
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
      employee: { select: { fullName: true } },
    },
  });
  if (!user?.isActive) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.employee?.fullName ?? user.email,
    role: user.role,
    employeeId: user.employeeId,
  };
});

/** Wajib login. Dipakai di setiap page `(main)` dan Server Action. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Wajib role ADMIN. Staf diarahkan ke halaman "Akses ditolak". */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/akses-ditolak");
  return user;
}
