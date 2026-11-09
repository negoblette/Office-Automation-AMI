import { getReadyUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { parseExportIds } from "@/lib/export-ids";
import { toJakartaIsoDate } from "@/lib/format";
import { enqueueSecurityAlert } from "@/lib/mail/security-emails";
import { requestMeta } from "@/lib/request-meta";
import { recordDataAccess } from "@/lib/services/security-monitor";
import { buildReimburseWorkbook, listReimburseExportRows } from "@/lib/services/reimburse-export";
import { exportSubject, textResponse, xlsxResponse } from "@/lib/xlsx-response";

/**
 * Ekspor reimburse yang dipilih ke Excel (2026-11-09): `?ids=<id>,<id>` dari panel "Pilih & Ekspor" atau tombol ekspor
 * di detail pengajuan. Admin: pengajuan siapa pun; selain Admin hanya miliknya sendiri (dicek di query).
 */
export async function GET(request: Request) {
  const user = await getReadyUser();
  if (!user) return textResponse("Silakan login terlebih dahulu", 401);

  const ids = parseExportIds(new URL(request.url).searchParams.get("ids"));
  if (ids.length === 0) return textResponse("Pilih minimal satu reimburse untuk diekspor", 400);
  const rows = await listReimburseExportRows(prisma, user, ids);
  if (rows.length === 0) return textResponse("Reimburse tidak ditemukan atau Anda tidak berhak mengaksesnya", 404);

  const numbers = [...new Set(rows.map((r) => r.number))];
  const who = exportSubject(rows.map((r) => r.employeeName));
  // Jejak ekspor (hardening Tahap 6) + alarm akses besar-besaran.
  const alert = await recordDataAccess(
    prisma,
    {
      actorId: user.id,
      actorName: user.name,
      action: "EXPORT",
      entity: "Reimbursement",
      entityId: numbers.length === 1 ? numbers[0] : `${numbers.length} pengajuan`,
      after: { format: "xlsx", pengajuan: numbers, karyawan: who, baris: rows.length },
    },
    requestMeta(request.headers),
  );
  await enqueueSecurityAlert(prisma, alert);

  const subject = numbers.length === 1 ? numbers[0].replaceAll("/", "-") : `${numbers.length} pengajuan`;
  const data = await buildReimburseWorkbook(rows, `Rekap Reimburse — ${who} (${numbers.length} pengajuan)`);
  return xlsxResponse(data, `Reimburse ${subject} - ${who} - ${toJakartaIsoDate()}.xlsx`);
}
