// npm run data:lihat -- --karyawan <email|id> --alasan "<alasan>" --oleh "<nama>" — hardening Tahap 4.
// Menampilkan data pribadi ASLI satu karyawan untuk keperluan yang sah (mis. memeriksa data yang salah).
// Dijalankan di server (tempat kunci berada); setiap pemakaian tercatat di audit log (VIEW_PERSONAL_DATA).
import "dotenv/config";
import { hostname } from "node:os";
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { FAMILY_RELATION_LABEL } from "@/lib/labels";
import { viewPersonalData } from "@/lib/services/personal-data-access";

const LABELS: Record<string, string> = {
  nik: "NIK",
  kkNo: "Nomor KK",
  birthPlace: "Tempat lahir",
  birthDate: "Tanggal lahir",
  address: "Alamat",
  phone: "Nomor HP",
  npwp: "NPWP",
  bpjsTkNo: "BPJS Ketenagakerjaan",
  bpjsKesNo: "BPJS Kesehatan",
  emergencyName: "Kontak darurat",
  emergencyRelation: "Hubungan",
  emergencyPhone: "HP kontak darurat",
};

const { values } = parseArgs({ options: { karyawan: { type: "string" }, alasan: { type: "string" }, oleh: { type: "string" } } });
if (!values.karyawan) {
  console.error('Pakai: npm run data:lihat -- --karyawan <email|id> --alasan "<alasan, min. 10 karakter>" --oleh "<nama Anda>"');
  process.exit(1);
}
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const data = await viewPersonalData(db, values.karyawan!, { reason: values.alasan ?? "", operator: values.oleh ?? "", host: hostname() });
  console.log(`${data.fullName} <${data.email}> — ${data.status}, id ${data.id}`);
  for (const [key, value] of Object.entries(data.personal)) console.log(`  ${LABELS[key].padEnd(22)} ${value ?? "—"}`);
  if (data.family.length) console.log("Keluarga:");
  for (const member of data.family) {
    console.log(`  ${FAMILY_RELATION_LABEL[member.relation].padEnd(14)} ${member.fullName} · NIK ${member.nik ?? "—"} · lahir ${member.birthDate ?? "—"}`);
  }
  console.log("\nPemakaian alat ini sudah dicatat di audit log (VIEW_PERSONAL_DATA).");
}

main()
  .catch((error) => {
    console.error("[data:lihat] GAGAL:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
