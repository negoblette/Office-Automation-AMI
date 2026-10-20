// Kunci enkripsi data pribadi (hardening Tahap 4, docs/08-INVENTARIS-DATA.md). Dibaca dari env saat pertama dipakai:
//   DATA_ENCRYPTION_KEYS = "v2:<base64 32 byte>,v1:<base64 32 byte>" — entri pertama dipakai untuk mengunci, semua entri
//                          dipakai untuk membuka (rotasi kunci tanpa kehilangan data lama). Buat: `npm run keys:generate`.
//   DATA_INDEX_KEY       = "<base64 32 byte>" — sidik jari NIK (blind index) untuk cek unik & pencarian.
// Tiap keperluan memakai subkey HKDF-SHA256 sendiri. Sengaja tanpa "server-only": dipakai juga skrip CLI (scripts/).
import { hkdfSync } from "node:crypto";

export type KeyPurpose = "field" | "file";

type KeyRing = { activeId: string; keys: Map<string, Buffer> };

const KEY_ID = /^[a-z0-9]{1,16}$/;
/** 32 byte dalam base64 standar = 43 karakter + satu "=". */
const KEY_VALUE = /^[A-Za-z0-9+/]{43}=$/;
const HINT = "Buat kunci dengan `npm run keys:generate` (lihat docs/08-INVENTARIS-DATA.md).";

function decodeKey(value: string, name: string): Buffer {
  if (!KEY_VALUE.test(value)) throw new Error(`${name} tidak valid: harus 32 byte acak dalam base64. ${HINT}`);
  return Buffer.from(value, "base64");
}

function parseKeyRing(raw: string): KeyRing {
  const keys = new Map<string, Buffer>();
  let activeId = "";
  for (const entry of raw.split(",").map((item) => item.trim()).filter(Boolean)) {
    const separator = entry.indexOf(":");
    const id = separator > 0 ? entry.slice(0, separator) : "";
    if (!KEY_ID.test(id)) throw new Error(`DATA_ENCRYPTION_KEYS: tiap entri harus "<id>:<kunci>", id huruf kecil/angka (maks 16). ${HINT}`);
    if (keys.has(id)) throw new Error(`DATA_ENCRYPTION_KEYS: id kunci "${id}" dipakai dua kali.`);
    keys.set(id, decodeKey(entry.slice(separator + 1), `DATA_ENCRYPTION_KEYS (kunci "${id}")`));
    activeId ||= id;
  }
  if (!activeId) throw new Error(`DATA_ENCRYPTION_KEYS belum diisi. ${HINT}`);
  return { activeId, keys };
}

let ringCache: { raw: string; ring: KeyRing } | undefined;

function keyRing(): KeyRing {
  const raw = process.env.DATA_ENCRYPTION_KEYS ?? "";
  // Dibaca ulang bila env berubah (mis. test rotasi kunci); parse gagal → tidak disimpan.
  if (ringCache?.raw !== raw) ringCache = { raw, ring: parseKeyRing(raw) };
  return ringCache.ring;
}

const subkeys = new WeakMap<Buffer, Map<string, Buffer>>();

/** Subkey per keperluan (HKDF-SHA256) — kunci yang sama tidak pernah dipakai untuk dua hal berbeda. */
function derive(master: Buffer, info: string): Buffer {
  let cache = subkeys.get(master);
  if (!cache) subkeys.set(master, (cache = new Map()));
  let key = cache.get(info);
  if (!key) cache.set(info, (key = Buffer.from(hkdfSync("sha256", master, Buffer.alloc(0), info, 32))));
  return key;
}

/** Kunci aktif untuk mengunci data baru. */
export function activeKey(purpose: KeyPurpose): { id: string; key: Buffer } {
  const ring = keyRing();
  return { id: ring.activeId, key: derive(ring.keys.get(ring.activeId)!, `oa:${purpose}:v1`) };
}

/** Id kunci aktif (dipakai `data:encrypt` untuk mengunci ulang data berkunci lama). */
export function activeKeyId(): string {
  return keyRing().activeId;
}

/** Kunci untuk membuka data yang dikunci dengan id `id`. */
export function keyById(purpose: KeyPurpose, id: string): Buffer {
  const master = keyRing().keys.get(id);
  if (!master) throw new Error(`Data dikunci dengan kunci "${id}" yang tidak ada di DATA_ENCRYPTION_KEYS. Kunci lama jangan dihapus dari daftar.`);
  return derive(master, `oa:${purpose}:v1`);
}

let indexCache: { raw: string; key: Buffer } | undefined;

/** Kunci HMAC sidik jari NIK. */
export function nikIndexKey(): Buffer {
  const raw = process.env.DATA_INDEX_KEY ?? "";
  if (indexCache?.raw !== raw) {
    if (!raw) throw new Error(`DATA_INDEX_KEY belum diisi. ${HINT}`);
    indexCache = { raw, key: derive(decodeKey(raw, "DATA_INDEX_KEY"), "oa:index:nik:v1") };
  }
  return indexCache.key;
}
