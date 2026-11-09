import { getReadyUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { parseExportIds } from "@/lib/export-ids";
import { toJakartaIsoDate } from "@/lib/format";
import { enqueueSecurityAlert } from "@/lib/mail/security-emails";
import { requestMeta } from "@/lib/request-meta";
import { buildHealthWorkbook, listHealthExportClaims } from "@/lib/services/health-export";
import { recordDataAccess } from "@/lib/services/security-monitor";
import { exportSubject, textResponse, xlsxResponse } from "@/lib/xlsx-response";

/**
 * Ekspor klaim kesehatan yang dipilih ke Excel (2026-11-09): `?ids=<id>,<id>`. Admin: klaim siapa pun; selain Admin hanya
 * miliknya sendiri (dicek di query).
 */
export async function GET(request: Request) {
  const user = await getReadyUser();
  if (!user) return textResponse("Silakan login terlebih dahulu", 401);

  const ids = parseExportIds(new URL(request.url).searchParams.get("ids"));
  if (ids.length === 0) return textResponse("Pilih minimal satu klaim untuk diekspor", 400);
  const claims = await listHealthExportClaims(prisma, user, ids);
  if (claims.length === 0) return textResponse("Klaim tidak ditemukan atau Anda tidak berhak mengaksesnya", 404);

  const who = exportSubject(claims.map((c) => c.employeeName));
  const alert = await recordDataAccess(
    prisma,
    {
      actorId: user.id,
      actorName: user.name,
      action: "EXPORT",
      entity: "HealthClaim",
      entityId: claims.length === 1 ? claims[0].number : `${claims.length} klaim`,
      after: { format: "xlsx", klaim: claims.map((c) => c.number), karyawan: who },
    },
    requestMeta(request.headers),
  );
  await enqueueSecurityAlert(prisma, alert);

  const subject = claims.length === 1 ? claims[0].number.replaceAll("/", "-") : `${claims.length} klaim`;
  return xlsxResponse(await buildHealthWorkbook(claims), `Klaim Kesehatan ${subject} - ${who} - ${toJakartaIsoDate()}.xlsx`);
}
