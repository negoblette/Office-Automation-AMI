// npm run recovery:refresh — docs/08-INVENTARIS-DATA.md §4–5.
// Tulis ulang file kunci pemulihan di RECOVERY_DIR: penerima.txt (gembok para pemegang kunci, dipakai backup) dan
// kunci-data.age (titipan DATA_ENCRYPTION_KEYS & DATA_INDEX_KEY yang AKTIF di env ini). Aman dijalankan berulang.
// Produksi: dijalankan otomatis oleh service "migrate" di setiap deploy, jadi rotasi kunci data atau perubahan
// RECOVERY_KEY_HOLDERS langsung ikut ke titipan — pemegang kunci tidak perlu melakukan apa pun.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { RECOVERY_MIN_HOLDERS, recoveryDir, refreshRecoveryFiles } from "@/lib/services/recovery-key";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const result = await refreshRecoveryFiles(db);
  console.log(`[recovery:refresh] folder ${recoveryDir()}`);
  if (result.holders.length === 0) {
    console.warn("[recovery:refresh] PERINGATAN: RECOVERY_KEY_HOLDERS kosong — belum ada pemegang kunci pemulihan.");
    return;
  }
  console.log(`  pemegang kunci   : ${result.holders.join(", ")}`);
  console.log(`  sudah punya kunci: ${result.withKey.join(", ") || "-"}`);
  console.log(`  titipan kunci data: ${result.escrow ? "diperbarui" : "belum ada (belum ada kunci pemulihan)"}`);
  if (result.withKey.length < RECOVERY_MIN_HOLDERS) {
    console.warn(
      `[recovery:refresh] PERINGATAN: baru ${result.withKey.length} dari minimal ${RECOVERY_MIN_HOLDERS} pemegang kunci yang membuat kunci pemulihan` +
        ` (${result.withoutKey.join(", ")}). Backup menunggu sampai cukup — minta mereka membuka Setting → Kunci Pemulihan.`,
    );
  }
}

main()
  .catch((error) => {
    console.error("[recovery:refresh] GAGAL:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
