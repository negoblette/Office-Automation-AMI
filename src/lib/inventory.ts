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
