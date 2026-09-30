import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Singleton supaya hot reload di dev tidak membuat koneksi baru terus-menerus.
// `unknown`: bisa berisi instance dari class PrismaClient versi generate sebelumnya.
const globalForPrisma = globalThis as unknown as { prisma?: unknown };

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

// Setelah `prisma generate` (mis. model baru), hot reload memuat class PrismaClient baru;
// client lama di globalThis tidak punya model baru → tutup dan buat ulang tanpa restart dev server.
const cached = globalForPrisma.prisma;
if (cached && !(cached instanceof PrismaClient)) {
  void (cached as { $disconnect(): Promise<void> }).$disconnect().catch(() => undefined);
}

export const prisma = cached instanceof PrismaClient ? cached : createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
