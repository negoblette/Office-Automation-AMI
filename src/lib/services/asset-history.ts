// Riwayat unit Inventory (permintaan user 2026-11-17): setiap perubahan data unit (siapa, kapan, apa yang berubah) dan
// setiap kali unit masuk pengajuan peminjaman beserta keputusan approval-nya. Sumbernya AuditLog — semua perubahan sudah
// tercatat permanen di sana beserta pelakunya, jadi tidak ada tabel riwayat terpisah yang bisa tidak sinkron.
import type { AuditLog, Prisma, PrismaClient } from "@/generated/prisma/client";
import type { AssetCategory, AssetOwnership, DemoLoanStatus, LoanPurpose } from "@/generated/prisma/enums";
import { loanPurposeText } from "@/lib/demo-loan";
import { formatDate } from "@/lib/format";
import { ASSET_OWNERSHIP_LABEL, rackLocationLabel } from "@/lib/inventory";
import { ASSET_CATEGORY_LABEL } from "@/lib/labels";

export type AssetHistoryEvent = {
  id: string;
  /** ISO datetime. */
  at: string;
  actor: string | null;
  kind: "created" | "updated" | "deleted" | "loan" | "approved" | "rejected";
  title: string;
  /** Perubahan data unit, mis. Lokasi: Rak 1 · A1 → Rak 1 · B2. */
  changes: { label: string; before: string; after: string }[];
  note: string | null;
  /** Halaman peminjaman terkait. */
  href: string | null;
};

type Json = Record<string, unknown>;
const obj = (value: Prisma.JsonValue | null): Json => (value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {});
const str = (value: unknown) => (typeof value === "string" && value !== "" ? value : null);
const dateText = (value: unknown) => (str(value) ? formatDate(value as string, "short") : "—");
const text = (value: unknown) => str(value) ?? "—";

/** Kolom unit yang ditampilkan di riwayat, berurutan seperti di form. */
const FIELDS: { key: string; label: string; format: (value: unknown) => string }[] = [
  { key: "deviceName", label: "Part number / deskripsi", format: text },
  { key: "serialNo", label: "Serial number", format: text },
  { key: "category", label: "Kategori", format: (value) => (str(value) ? ASSET_CATEGORY_LABEL[value as AssetCategory] : "—") },
  // Catatan audit sebelum kolom kepemilikan ada (2026-11-17) = milik AMI.
  { key: "ownership", label: "Kepemilikan", format: (value) => ASSET_OWNERSHIP_LABEL[(str(value) ?? "AMI") as AssetOwnership] },
  { key: "ownerName", label: "Nama principal / distributor", format: text },
  { key: "supportStart", label: "Support mulai", format: dateText },
  { key: "supportEnd", label: "Support berakhir", format: dateText },
  { key: "warrantyStart", label: "Warranty mulai", format: dateText },
  { key: "warrantyEnd", label: "Warranty berakhir", format: dateText },
  { key: "warrantyNote", label: "Catatan warranty", format: text },
  { key: "notes", label: "Catatan", format: text },
];

const hasAsset = (snapshot: Json, assetId: string) =>
  Array.isArray(snapshot.items) && snapshot.items.some((item) => obj(item as Prisma.JsonValue).assetId === assetId);

type LogWithUser = AuditLog & { user: { email: string; employee: { fullName: string } | null } | null };

export async function assetHistory(db: PrismaClient, assetId: string): Promise<AssetHistoryEvent[]> {
  const userInclude = { user: { select: { email: true, employee: { select: { fullName: true } } } } } as const;
  const containsAsset = [{ assetId }];
  const [assetLogs, loanLogs] = await Promise.all([
    db.auditLog.findMany({ where: { entity: "Asset", entityId: assetId }, include: userInclude }),
    // Pengajuan / revisi / pembatalan peminjaman yang memuat unit ini (sebelum atau sesudah perubahan).
    db.auditLog.findMany({
      where: {
        entity: "DemoLoan",
        OR: [{ after: { path: ["items"], array_contains: containsAsset } }, { before: { path: ["items"], array_contains: containsAsset } }],
      },
      include: userInclude,
    }),
  ]);

  // Keputusan approval peminjaman-peminjaman itu (dicocokkan lewat nomor form di audit approval).
  const loanNumbers = [...new Set(loanLogs.map((log) => str(obj(log.after).number) ?? str(obj(log.before).number)).filter((n): n is string => Boolean(n)))];
  const approvalLogs = loanNumbers.length
    ? await db.auditLog.findMany({
        where: {
          entity: "ApprovalRequest",
          action: { in: ["APPROVE", "REJECT"] },
          AND: [{ after: { path: ["module"], equals: "DEMO_LOAN" } }, { OR: loanNumbers.map((number) => ({ after: { path: ["entityNumber"], equals: number } })) }],
        },
        include: userInclude,
      })
    : [];
  const loanIdOfNumber = new Map(loanLogs.map((log) => [str(obj(log.after).number) ?? str(obj(log.before).number), log.entityId]));

  // Nama rak (termasuk yang sudah dihapus) untuk kolom Lokasi.
  const rackIds = new Set<string>();
  for (const log of assetLogs) for (const snapshot of [obj(log.before), obj(log.after)]) if (str(snapshot.rackId)) rackIds.add(snapshot.rackId as string);
  const racks = rackIds.size ? await db.storageRack.findMany({ where: { id: { in: [...rackIds] } }, select: { id: true, name: true } }) : [];
  const rackName = new Map(racks.map((rack) => [rack.id, rack.name]));
  const location = (snapshot: Json) => rackLocationLabel(rackName.get(snapshot.rackId as string), str(snapshot.rackPosition)) ?? "Tidak di rak";

  const actorOf = (log: LogWithUser) => (log.user ? (log.user.employee?.fullName ?? log.user.email) : null);
  const base = (log: LogWithUser) => ({ id: log.id, at: log.createdAt.toISOString(), actor: actorOf(log) });
  const events: AssetHistoryEvent[] = [];

  for (const log of assetLogs) {
    const before = obj(log.before);
    const after = obj(log.after);
    if (log.action === "CREATE") {
      events.push({ ...base(log), kind: "created", title: "Unit didaftarkan", changes: [], note: `Lokasi awal: ${location(after)}`, href: null });
    } else if (log.action === "DELETE") {
      events.push({ ...base(log), kind: "deleted", title: "Unit dihapus", changes: [], note: null, href: null });
    } else {
      const changes = FIELDS.filter((field) => field.format(before[field.key]) !== field.format(after[field.key])).map((field) => ({
        label: field.label,
        before: field.format(before[field.key]),
        after: field.format(after[field.key]),
      }));
      if (location(before) !== location(after)) changes.push({ label: "Lokasi", before: location(before), after: location(after) });
      events.push({ ...base(log), kind: "updated", title: "Data unit diubah", changes, note: changes.length ? null : "Disimpan tanpa perubahan", href: null });
    }
  }

  for (const log of loanLogs) {
    const before = obj(log.before);
    const after = obj(log.after);
    const number = str(after.number) ?? str(before.number) ?? "";
    const borrower = str(after.borrowerName) ?? str(before.borrowerName) ?? "";
    const purpose = str(after.purpose) ?? str(before.purpose);
    const wasIn = hasAsset(before, assetId);
    const isIn = hasAsset(after, assetId);
    const status = str(after.status) as DemoLoanStatus | null;
    let title: string;
    if (log.action === "CREATE") title = "Diajukan pinjam";
    else if (status === "CANCELLED") title = "Pengajuan pinjam dibatalkan";
    else if (status === "ON_LOAN" && before.status !== "ON_LOAN") title = "Diantar ke peminjam";
    else if (status === "RETURNED" && before.status !== "RETURNED") title = "Dikembalikan dari peminjam";
    else if (wasIn && Array.isArray(after.items) && !isIn) title = "Dikeluarkan dari pengajuan pinjam";
    else if (!wasIn && isIn) title = "Ditambahkan ke pengajuan pinjam";
    else if (before.status === "REJECTED") title = "Diajukan ulang";
    else title = "Pengajuan pinjam diubah";
    const purposeText = purpose ? `${loanPurposeText(purpose as LoanPurpose, str(after.purposeDetail) ?? str(before.purposeDetail))} · ` : "";
    events.push({ ...base(log), kind: "loan", title, changes: [], note: `${purposeText}${borrower} · ${number}`, href: `/inventory/peminjaman/${log.entityId}` });
  }

  /** Unit ini masih ada di peminjaman pada waktu `at`? (catatan peminjaman terakhir sebelum waktu itu.) */
  const inLoanAt = (loanId: string | undefined, at: Date) => {
    const last = loanLogs.filter((log) => log.entityId === loanId && log.createdAt <= at).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    if (!last) return false;
    const after = obj(last.after);
    return Array.isArray(after.items) ? hasAsset(after, assetId) : hasAsset(obj(last.before), assetId);
  };

  for (const log of approvalLogs) {
    const after = obj(log.after);
    const number = str(after.entityNumber) ?? "";
    const loanId = loanIdOfNumber.get(number);
    // Keputusan setelah unit dikeluarkan dari pengajuan (revisi) bukan bagian riwayat unit ini.
    if (!inLoanAt(loanId, log.createdAt)) continue;
    const rejected = log.action === "REJECT";
    events.push({
      ...base(log),
      kind: rejected ? "rejected" : "approved",
      title: rejected ? `Pengajuan pinjam ditolak (level ${after.level})` : `Pengajuan pinjam disetujui (level ${after.level})`,
      changes: [],
      note: [number, rejected ? str(after.reason) : str(after.note)].filter(Boolean).join(" · ") || null,
      href: loanId ? `/inventory/peminjaman/${loanId}` : null,
    });
  }

  return events.sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
}
