// Ringkasan permintaan perubahan data disimpan sebagai baris teks ("Alamat: A → B"). Fungsi ini memecahnya
// jadi tabel Data | Sebelum | Sesudah untuk pratinjau (2026-10-13). Aman dipakai di client.

export type ChangeRow = { label: string; before: string; after: string };
export type ChangePreview = { context: string[]; rows: ChangeRow[] };

export function parseChangeLines(lines: string[]): ChangePreview {
  const context: string[] = [];
  const rows: ChangeRow[] = [];
  for (const line of lines) {
    const colon = line.indexOf(": ");
    const arrow = line.indexOf(" → ", colon + 2);
    if (colon > 0 && arrow > colon) {
      rows.push({ label: line.slice(0, colon), before: line.slice(colon + 2, arrow), after: line.slice(arrow + 3) });
    } else if (colon > 0) {
      // Tambah / hapus: "Suami / Istri: Rina" → kolom sebelum kosong.
      rows.push({ label: line.slice(0, colon), before: "—", after: line.slice(colon + 2) });
    } else {
      context.push(line);
    }
  }
  return { context, rows };
}
