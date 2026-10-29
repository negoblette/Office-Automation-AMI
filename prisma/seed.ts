// Seed data awal — docs/02-TECH-SPEC.md §4.4, docs/05-TAHAPAN.md Fase 1.
// Idempoten: aman dijalankan berulang (`npx prisma db seed`). Data & fungsi ada di seed-lib.ts.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import argon2 from "argon2";
import { PrismaClient } from "../src/generated/prisma/client";
import { seedAll, seedProduction } from "./seed-lib";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const seedPassword = process.env.SEED_PASSWORD;
  if (!seedPassword || seedPassword.length < 8) {
    throw new Error("SEED_PASSWORD wajib diisi di .env (minimal 8 karakter).");
  }
  const passwordHash = await argon2.hash(seedPassword);

  // Produksi (SEED_MODE=production di compose prod, 2026-10-29): hanya akun Admin sistem + aturan cuti; data contoh
  // dev (divisi, 8 orang, master data, alur approval) tidak pernah masuk ke server.
  if (process.env.SEED_MODE === "production") {
    const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
      throw new Error("SEED_ADMIN_EMAIL wajib diisi email akun Admin sistem (mis. admin-oa@artha-mitra.co.id).");
    }
    await seedProduction(prisma, passwordHash, adminEmail);
  } else {
    await seedAll(prisma, passwordHash);
  }

  // Produksi: akun hasil seed wajib ganti password saat login pertama (hardening 2026-10).
  // Akun yang sudah pernah ganti password tidak disentuh saat seed diulang.
  if (process.env.SEED_MUST_CHANGE_PASSWORD === "true") {
    await prisma.user.updateMany({ where: { passwordChangedAt: null }, data: { mustChangePassword: true } });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
