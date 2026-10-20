import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrasi, `db seed`, & Studio memakai role pemilik (MIGRATE_DATABASE_URL); aplikasi & worker memakai DATABASE_URL
    // (role oa_app, hanya baca/tulis isi tabel) — hardening Tahap 4. Kosong → DATABASE_URL seperti sebelumnya.
    url: process.env.MIGRATE_DATABASE_URL || env("DATABASE_URL"),
  },
});
