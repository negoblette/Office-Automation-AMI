// npm run dev:data-palsu [-- --karyawan <email>] [-- --kosongkan] — hardening Tahap 4 (higiene dev).
// Data karyawan ASLI dilarang dipakai di dev (docs/08-INVENTARIS-DATA.md). Skrip ini mengisi data diri PALSU
// (NIK diawali 99, HP +62800…) untuk karyawan yang data dirinya masih kosong, supaya fitur bisa dicoba dengan data yang
// mirip asli. --kosongkan menghapus lagi data diri palsu (yang NIK-nya diawali 99). Hanya untuk database lokal.
// Seed tetap tidak mengisi data diri.
import "dotenv/config";
import { randomInt } from "node:crypto";
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { profileCompleteness } from "@/lib/employee-profile";
import { openEmployee, sealEmployeeData } from "@/lib/services/personal-data";
import { employeeSelfSchema } from "@/lib/validators/employee";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const databaseUrl = process.env.DATABASE_URL ?? "";
if (process.env.NODE_ENV === "production" || !LOCAL_HOSTS.has(URL.parse(databaseUrl)?.hostname ?? "")) {
  console.error("[dev:data-palsu] DITOLAK: hanya boleh dijalankan ke database dev lokal (localhost).");
  process.exit(1);
}

const { values } = parseArgs({ options: { karyawan: { type: "string" }, kosongkan: { type: "boolean", default: false } } });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

const digits = (length: number) => Array.from({ length }, () => randomInt(10)).join("");
const pad = (value: number) => String(value).padStart(2, "0");

/** Data diri palsu yang lolos validasi aplikasi (schema yang sama dengan form Profil). */
function fakeSelfData(maritalStatus: string, index: number) {
  return employeeSelfSchema.parse({
    nik: `99${digits(14)}`,
    kkNo: `99${digits(14)}`,
    birthPlace: "Kota Contoh",
    birthDate: `${randomInt(1975, 2001)}-${pad(randomInt(1, 13))}-${pad(randomInt(1, 29))}`,
    gender: randomInt(2) ? "MALE" : "FEMALE",
    maritalStatus,
    address: `Jl. Contoh No. ${index + 1}, Jakarta`,
    phone: `0800${digits(7)}`,
    npwp: `99${digits(13)}`,
    bpjsTkNo: `99${digits(9)}`,
    bpjsKesNo: `99${digits(11)}`,
    emergencyName: "Kontak Darurat Contoh",
    emergencyRelation: "Saudara",
    emergencyPhone: `0800${digits(7)}`,
  });
}

async function main() {
  const rows = await db.employee.findMany({
    where: values.karyawan ? { email: values.karyawan.toLowerCase() } : { status: "ACTIVE" },
    orderBy: { fullName: "asc" },
  });
  if (values.karyawan && !rows.length) throw new Error(`Karyawan ${values.karyawan} tidak ditemukan`);

  let changed = 0;
  for (const [index, row] of rows.entries()) {
    const employee = openEmployee(row);
    if (values.kosongkan) {
      if (!employee.nik?.startsWith("99")) continue;
      await db.employee.update({
        where: { id: row.id },
        data: {
          birthPlace: null,
          gender: null,
          address: null,
          ...sealEmployeeData({ nik: null, kkNo: null, birthDate: null, phone: null, npwp: null, bpjsTkNo: null, bpjsKesNo: null, emergencyName: null, emergencyRelation: null, emergencyPhone: null }),
        },
      });
    } else {
      if (profileCompleteness(employee).filled > 0) {
        if (values.karyawan) console.log(`${employee.fullName}: data diri sudah terisi, tidak ditimpa.`);
        continue;
      }
      const self = fakeSelfData(employee.maritalStatus, index);
      await db.employee.update({
        where: { id: row.id },
        data: {
          birthPlace: self.birthPlace,
          gender: self.gender,
          address: self.address,
          ...sealEmployeeData({
            nik: self.nik,
            kkNo: self.kkNo,
            birthDate: self.birthDate,
            phone: self.phone,
            npwp: self.npwp,
            bpjsTkNo: self.bpjsTkNo,
            bpjsKesNo: self.bpjsKesNo,
            emergencyName: self.emergencyName,
            emergencyRelation: self.emergencyRelation,
            emergencyPhone: self.emergencyPhone,
          }),
        },
      });
    }
    changed++;
    console.log(`  ${employee.fullName} <${employee.email}>`);
  }
  console.log(`[dev:data-palsu] ${changed} karyawan ${values.kosongkan ? "dikosongkan data diri palsunya" : "diisi data diri palsu (terenkripsi)"}.`);
}

main()
  .catch((error) => {
    console.error("[dev:data-palsu] GAGAL:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
