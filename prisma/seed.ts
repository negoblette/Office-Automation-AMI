// Seed data awal — docs/02-TECH-SPEC.md §4.4, docs/05-TAHAPAN.md Fase 1.
// Idempoten: aman dijalankan berulang (`npx prisma db seed`). Data & fungsi ada di seed-lib.ts.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import argon2 from "argon2";
import { PrismaClient } from "../src/generated/prisma/client";
import { seedAll } from "./seed-lib";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const seedPassword = process.env.SEED_PASSWORD;
  if (!seedPassword || seedPassword.length < 8) {
    throw new Error("SEED_PASSWORD wajib diisi di .env (minimal 8 karakter).");
  }
  await seedAll(prisma, await argon2.hash(seedPassword));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
