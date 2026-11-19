// Inventory & unit demo (2026-11-17) — aturan murni tanpa database: akses per divisi, posisi rak, kepemilikan.
import type { AssetOwnership } from "@/generated/prisma/enums";

/** Kepemilikan unit: milik AMI, atau titipan principal / distributor (2026-11-17). */
export const ASSET_OWNERSHIP_LABEL: Record<AssetOwnership, string> = {
  AMI: "Milik AMI",
  PRINCIPAL: "Principal",
  DISTRIBUTOR: "Distributor",
};

/** "Milik AMI" / "Principal · Cisco" / "Distributor · PT Datascrip". */
export function ownershipText(ownership: AssetOwnership, ownerName: string | null | undefined): string {
  return ownership === "AMI" || !ownerName ? ASSET_OWNERSHIP_LABEL[ownership] : `${ASSET_OWNERSHIP_LABEL[ownership]} · ${ownerName}`;
}

/** Divisi yang boleh memakai Inventory (selain Admin & Operational). Kode persis, bukan divisi acuan (`followsCode`). */
export const INVENTORY_DIVISIONS: readonly string[] = ["ENGINEER", "SALES"];

/** Batas ukuran rak: kolom A–Z, baris 1–50. */
export const RACK_LIMITS = { columns: 26, rows: 50 } as const;

/** Posisi di rak: huruf kolom + nomor baris, mis. "A1", "C12". */
export const RACK_POSITION = /^([A-Z])([1-9]\d?)$/;

export const columnLetter = (index: number) => String.fromCharCode(65 + index);

/** Semua posisi rak, urut per baris lalu kolom: A1, B1, C1, …, A2, B2, … */
export function rackPositions(columns: number, rows: number): string[] {
  const positions: string[] = [];
  for (let row = 1; row <= rows; row++) for (let column = 0; column < columns; column++) positions.push(`${columnLetter(column)}${row}`);
  return positions;
}

/** Kolom (0 = A) & baris (mulai 1) dari posisi, atau null bila formatnya salah. */
export function parseRackPosition(position: string): { column: number; row: number } | null {
  const match = RACK_POSITION.exec(position);
  return match ? { column: match[1].charCodeAt(0) - 65, row: Number(match[2]) } : null;
}

export function isPositionInRack(position: string, rack: { columns: number; rows: number }): boolean {
  const parsed = parseRackPosition(position);
  return parsed !== null && parsed.column < rack.columns && parsed.row <= rack.rows;
}

/** Rentang posisi untuk tampilan, mis. "A1–D5". */
export const rackRangeLabel = (rack: { columns: number; rows: number }) => `A1–${columnLetter(rack.columns - 1)}${rack.rows}`;

/** "Rak 1 · A1", atau null bila unit tidak disimpan di rak. */
export function rackLocationLabel(rackName: string | null | undefined, position: string | null | undefined): string | null {
  return rackName && position ? `${rackName} · ${position}` : null;
}

// ---------------------------------------------------------------------
// Daftar Unit dikelompokkan per rak (2026-11-19): sekat per rak, "Tidak di rak" paling bawah.
// ---------------------------------------------------------------------

/** Kunci kelompok unit yang tidak disimpan di rak. */
export const NO_RACK_GROUP = "__tanpa-rak";

type RackedUnit = { rackId: string | null; rackName: string | null; rackPosition: string | null; deviceName: string; serialNo: string };

const natural = (a: string, b: string) => a.localeCompare(b, "id", { numeric: true, sensitivity: "base" });

/** Kelompok unit = raknya (hanya bila punya posisi, sama dengan filter "Di rak"); selain itu "Tidak di rak". */
export function rackGroupKey(unit: Pick<RackedUnit, "rackId" | "rackPosition">): string {
  return unit.rackId && unit.rackPosition ? unit.rackId : NO_RACK_GROUP;
}

/** Pembanding kelompok: nama rak urut alami (Rak 2 sebelum Rak 10), "Tidak di rak" selalu terakhir. */
export function rackGroupComparator(nameOf: (key: string) => string) {
  return (a: string, b: string) => {
    if (a === b) return 0;
    if (a === NO_RACK_GROUP || b === NO_RACK_GROUP) return a === NO_RACK_GROUP ? 1 : -1;
    return natural(nameOf(a), nameOf(b)) || a.localeCompare(b);
  };
}

/**
 * Urutan bawaan Daftar Unit per rak: kelompok rak, lalu posisi seperti susunan fisik (A1, A2, …, A10, B1), lalu nama
 * perangkat & serial. Tidak mengubah array asal.
 */
export function sortUnitsByRack<T extends RackedUnit>(units: T[]): T[] {
  const names = new Map(units.map((unit) => [rackGroupKey(unit), unit.rackName ?? ""]));
  const compareGroup = rackGroupComparator((key) => names.get(key) ?? "");
  return [...units].sort(
    (a, b) =>
      compareGroup(rackGroupKey(a), rackGroupKey(b)) ||
      natural(a.rackPosition ?? "", b.rackPosition ?? "") ||
      natural(a.deviceName, b.deviceName) ||
      natural(a.serialNo, b.serialNo),
  );
}
