// npm run data:cari-nik -- <NIK> --alasan "<alasan>" --oleh "<nama>" — hardening Tahap 4.
// Mencari karyawan lewat NIK memakai sidik jari NIK (NIK tersimpan terenkripsi). Hanya menampilkan identitas akun,
// bukan data pribadi. Setiap pemakaian tercatat di audit log (VIEW_PERSONAL_DATA).
import "dotenv/config";
import { hostname } from "node:os";
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { findEmployeeByNik } from "@/lib/services/personal-data-access";

const { values, positionals } = parseArgs({ allowPositionals: true, options: { alasan: { type: "string" }, oleh: { type: "string" } } });
if (!positionals[0]) {
  console.error('Pakai: npm run data:cari-nik -- <NIK 16 digit> --alasan "<alasan, min. 10 karakter>" --oleh "<nama Anda>"');
  process.exit(1);
}
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const employee = await findEmployeeByNik(db, positionals[0], { reason: values.alasan ?? "", operator: values.oleh ?? "", host: hostname() });
  console.log(employee ? `Ditemukan: ${employee.fullName} <${employee.email}> — ${employee.status}, id ${employee.id}` : "Tidak ada karyawan dengan NIK itu.");
  console.log("Pencarian ini sudah dicatat di audit log (VIEW_PERSONAL_DATA).");
}

main()
  .catch((error) => {
    console.error("[data:cari-nik] GAGAL:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
