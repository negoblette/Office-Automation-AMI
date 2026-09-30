// Global setup untuk test database (`*.db.test.ts`): buat ulang DB test lalu jalankan migrasi.
// DB dev tidak pernah disentuh — nama DB wajib berakhiran `_test`.
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { Client } from "pg";

export default async function setup() {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL belum diisi di .env");

  const url = new URL(testUrl);
  const dbName = url.pathname.slice(1);
  if (!/^[a-z0-9_]+_test$/.test(dbName)) {
    throw new Error(`Nama database test harus berakhiran "_test" (sekarang: "${dbName}")`);
  }

  const adminUrl = new URL(testUrl);
  adminUrl.pathname = "/postgres";
  adminUrl.search = "";
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
  }

  const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: testUrl },
    shell: true,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`Migrasi database test gagal:\n${result.stdout}\n${result.stderr}`);
  }
}
