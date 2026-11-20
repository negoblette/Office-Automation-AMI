// Riwayat unit Inventory (permintaan user 2026-11-17): setiap perubahan data unit (siapa, kapan, apa yang berubah) dan
// setiap kali unit masuk pengajuan peminjaman beserta keputusan approval-nya. Sumbernya AuditLog — semua perubahan sudah
// tercatat permanen di sana beserta pelakunya, jadi tidak ada tabel riwayat terpisah yang bisa tidak sinkron.
import type { AuditLog, Prisma, PrismaClient } from "@/generated/prisma/client";
import type { AssetCategory, AssetOwnership, DemoLoanStatus, LoanPurpose, ReturnCondition } from "@/generated/prisma/enums";
import { loanPurposeText, RETURN_CONDITION_LABEL } from "@/lib/demo-loan";
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

  // Unit principal / distributor yang masuk lewat penerimaan barang (2026-11-20): nomor HAF untuk catatan riwayatnya.
  const receiptIds = [...new Set(assetLogs.map((log) => str(obj(log.after).receiptId)).filter((id): id is string => Boolean(id)))];
  const receipts = receiptIds.length ? await db.goodsReceipt.findMany({ where: { id: { in: receiptIds } }, select: { id: true, hafNumber: true } }) : [];
  const hafOfReceipt = new Map(receipts.map((receipt) => [receipt.id, receipt.hafNumber]));

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
    if (log.action === "CREATE" && str(after.receiptId)) {
      const owner = `${ASSET_OWNERSHIP_LABEL[(str(after.ownership) ?? "PRINCIPAL") as AssetOwnership]} ${str(after.ownerName) ?? ""}`.trim();
      const haf = hafOfReceipt.get(after.receiptId as string);
      events.push({
        ...base(log),
        kind: "created",
        title: `Diterima dari ${owner}`,
        changes: [],
        note: [haf && `HAF ${haf}`, `Lokasi awal: ${location(after)}`].filter(Boolean).join(" · "),
        href: `/inventory/penerimaan/${after.receiptId as string}`,
      });
    } else if (log.action === "CREATE") {
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
    const unitOf = (snapshot: Json) =>
      Array.isArray(snapshot.items) ? snapshot.items.map((item) => obj(item as Prisma.JsonValue)).find((item) => item.assetId === assetId) : undefined;
    // Tindak lanjut selesai (2026-11-20): hanya untuk unit yang memang bermasalah; unit Baik di peminjaman itu dilewati.
    // Sejak revisi 2026-11-20 lanjut ke Menunggu verifikasi; data lama langsung Selesai.
    const followUpDone = (status === "RETURN_REVIEW" || status === "RETURNED") && before.status === "FOLLOW_UP";
    const resolved = followUpDone ? (str(unitOf(after)?.resolvedCondition) as ReturnCondition | null) : null;
    if (followUpDone && !resolved) continue;
    // Jatuh tempo berubah saat dipinjam = perpanjangan disetujui / persetujuannya dibatalkan (Tahap 16.4).
    const dueChanged = status === "ON_LOAN" && before.status === "ON_LOAN" && str(after.dueDate) && str(after.dueDate) !== str(before.dueDate);
    // Barang tiba & dicek (Tahap 16.5): ada unit bermasalah → Perlu Tindak Lanjut, selain itu menunggu verifikasi engineer
    // (data lama: langsung Selesai). Verifikasi disetujui → Selesai (alur lama: bisa Perlu Tindak Lanjut); ditolak →
    // kembali Pengambilan.
    const returned = (status === "RETURN_REVIEW" || status === "RETURNED" || status === "FOLLOW_UP") && before.status === "PICKUP";
    const verified = (status === "RETURNED" || status === "FOLLOW_UP") && before.status === "RETURN_REVIEW";
    const verifyRejected = status === "PICKUP" && before.status === "RETURN_REVIEW";
    let title: string;
    if (followUpDone) title = "Tindak lanjut selesai";
    else if (verified) title = "Pengecekan diverifikasi";
    else if (verifyRejected) title = "Verifikasi pengecekan ditolak";
    else if (dueChanged) title = String(after.dueDate) > String(before.dueDate) ? "Jatuh tempo diperpanjang" : "Perpanjangan jatuh tempo dibatalkan";
    else if (log.action === "CREATE") title = "Diajukan pinjam";
    else if (status === "CANCELLED") title = "Pengajuan pinjam dibatalkan";
    // Pengambilan (2026-11-19): HAF terbit & dibawa kurir; jadwal diubah; dibatalkan → kembali Dipinjam.
    else if (status === "PICKUP") title = before.status === "PICKUP" ? "Jadwal pengambilan diubah" : "Dijadwalkan diambil kembali";
    else if (status === "ON_LOAN" && before.status === "PICKUP") title = "Pengambilan dibatalkan";
    else if (status === "ON_LOAN" && before.status !== "ON_LOAN") title = "Diantar ke peminjam";
    else if (returned || (status === "RETURNED" && before.status !== "RETURNED")) title = "Dikembalikan dari peminjam";
    else if (wasIn && Array.isArray(after.items) && !isIn) title = "Dikeluarkan dari pengajuan pinjam";
    else if (!wasIn && isIn) title = "Ditambahkan ke pengajuan pinjam";
    else if (before.status === "REJECTED") title = "Diajukan ulang";
    else title = "Pengajuan pinjam diubah";
    const purposeText = purpose ? `${loanPurposeText(purpose as LoanPurpose, str(after.purposeDetail) ?? str(before.purposeDetail))} · ` : "";
    // Dikembalikan (Tahap 16.5): kondisi unit ini saat dicek + nomor HAF (+ perlu tindak lanjut bila bermasalah).
    const arrived = returned || (status === "RETURNED" && before.status !== "RETURNED" && !followUpDone && !verified);
    const check = arrived || verified ? unitOf(after) : undefined;
    const condition = str(check?.returnCondition) as ReturnCondition | null;
    const conditionText = condition ? `Kondisi ${RETURN_CONDITION_LABEL[condition]}${str(check?.returnNote) ? ` — ${check?.returnNote}` : ""}` : null;
    const flagged = status === "FOLLOW_UP" && condition !== null && condition !== "GOOD" ? "perlu tindak lanjut" : status === "RETURN_REVIEW" ? "menunggu verifikasi" : null;
    const note = followUpDone
      ? [`Kondisi akhir ${resolved ? RETURN_CONDITION_LABEL[resolved] : "—"}`, str(after.followUpNote), `${borrower} · ${number}`].filter(Boolean).join(" · ")
      : verified
      ? [conditionText, flagged, `${borrower} · ${number}`].filter(Boolean).join(" · ")
      : verifyRejected
      ? `Dicek ulang Operational · ${borrower} · ${number}`
      : arrived
      ? [conditionText, flagged, str(after.hafNumber) && `HAF ${after.hafNumber}`, `${borrower} · ${number}`].filter(Boolean).join(" · ")
      : dueChanged
        ? `Jatuh tempo ${dateText(before.dueDate)} → ${dateText(after.dueDate)} · ${borrower} · ${number}`
        : status === "PICKUP"
          ? [`Diambil ${dateText(after.pickupDate)}`, str(after.hafNumber) && `HAF ${after.hafNumber}`, `${borrower} · ${number}`].filter(Boolean).join(" · ")
          : `${purposeText}${borrower} · ${number}`;
    events.push({ ...base(log), kind: "loan", title, changes: [], note, href: `/inventory/peminjaman/${log.entityId}` });
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
