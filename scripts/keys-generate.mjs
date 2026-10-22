// Kunci enkripsi data pribadi baru (hardening Tahap 4, docs/08-INVENTARIS-DATA.md).
//   npm run keys:generate                 → kunci awal: DATA_ENCRYPTION_KEYS ("v1:…") + DATA_INDEX_KEY
//   npm run keys:generate -- --rotasi v2  → kunci baru untuk rotasi (taruh di DEPAN daftar, kunci lama tetap disimpan)
// Selalu acak & baru: kunci dev dan produksi WAJIB berbeda. Salinan kunci produksi dititipkan otomatis (terkunci kata
// sandi pemulihan Pak Rudy & Pak Leonard) oleh service migrate — lihat src/lib/services/recovery-key.ts.
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { rotasi: { type: "string" } } });
const newKey = () => randomBytes(32).toString("base64");

if (values.rotasi !== undefined) {
  if (!/^[a-z0-9]{1,16}$/.test(values.rotasi)) {
    console.error("--rotasi harus id kunci baru: huruf kecil/angka, maks 16 karakter (mis. v2).");
    process.exit(1);
  }
  console.log(`${values.rotasi}:${newKey()}`);
  console.error(
    `\nTambahkan entri di atas di DEPAN DATA_ENCRYPTION_KEYS, mis. DATA_ENCRYPTION_KEYS="${values.rotasi}:…,v1:…",` +
      "\nrestart aplikasi (produksi: `up -d` → migrate mengunci ulang data & memperbarui titipan kunci; dev: `npm run data:encrypt`)." +
      "\nKunci lama JANGAN dihapus (audit log & backup lama memakainya).",
  );
} else {
  console.log(`DATA_ENCRYPTION_KEYS="v1:${newKey()}"`);
  console.log(`DATA_INDEX_KEY="${newKey()}"`);
  console.error(
    "\nSalin ke .env (dev) atau .env.production (server). Kunci dev dan produksi harus berbeda." +
      "\nKunci produksi dititipkan otomatis setelah Pak Rudy & Pak Leonard membuat kata sandi pemulihan (Setting → Kunci Pemulihan)." +
      "\nKunci hilang tanpa titipan = data terenkripsi hilang.",
  );
}
