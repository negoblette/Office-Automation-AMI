// npm run data:encrypt [-- --cek] — hardening Tahap 4 (docs/08-INVENTARIS-DATA.md).
// Mengenkripsi data pribadi & file upload yang masih terbuka, mengenkripsi ulang yang memakai kunci lama (rotasi), dan
// menghitung ulang sidik jari NIK. Aman dijalankan berulang. --cek hanya menghitung tanpa mengubah apa pun.
// Produksi: dijalankan otomatis oleh service "migrate" setelah `prisma migrate deploy`.
import "dotenv/config";
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { encryptPersonalData } from "@/lib/services/data-encryption";

const { values } = parseArgs({ options: { cek: { type: "boolean", default: false } } });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const result = await encryptPersonalData(db, { dryRun: values.cek, uploadDir: process.env.UPLOAD_DIR ?? "./storage/uploads" });
  const verb = result.dryRun ? "perlu dikunci" : "dikunci";
  console.log(`[data:encrypt] kunci aktif "${result.keyId}"${result.dryRun ? " — mode --cek, tidak ada yang diubah" : ""}`);
  for (const table of result.tables) {
    console.log(`  ${table.table.padEnd(22)} ${table.rows} baris, ${table.changedRows} baris ${verb} (${table.changedValues} nilai)`);
  }
  console.log(`  ${"File upload".padEnd(22)} ${result.files.total} file, ${result.files.changed} file ${verb}`);
}

main()
  .catch((error) => {
    console.error("[data:encrypt] GAGAL:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
