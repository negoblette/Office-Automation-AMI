import { getReadyUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { toJakartaIsoDate } from "@/lib/format";
import { enqueueSecurityAlert } from "@/lib/mail/security-emails";
import { requestMeta } from "@/lib/request-meta";
import { recordDataAccess } from "@/lib/services/security-monitor";
import { buildReimburseWorkbook, listReimburseExportRows } from "@/lib/services/reimburse-export";

function text(message: string, status: number) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

/**
 * Export reimburse satu bulan transaksi ke Excel (2026-10-16). `?bulan=YYYY-MM&karyawan=<id>|semua`.
 * Admin: satu karyawan atau semua; selain Admin hanya miliknya sendiri.
 */
export async function GET(request: Request) {
  const user = await getReadyUser();
  if (!user) return text("Silakan login terlebih dahulu", 401);

  const params = new URL(request.url).searchParams;
  const karyawan = params.get("karyawan") ?? "";
  const bulan = params.get("bulan") ?? "";
  if (karyawan && karyawan !== user.employeeId && user.role !== "ADMIN") return text("Anda tidak berhak mengakses data ini", 403);
  const employeeId = user.role === "ADMIN" && karyawan ? (karyawan === "semua" ? null : karyawan) : user.employeeId;
  if (employeeId === null && user.role !== "ADMIN") return text("Anda tidak berhak mengakses data ini", 403);
  const yearMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(bulan) ? bulan : toJakartaIsoDate().slice(0, 7);

  const employee = employeeId ? await prisma.employee.findUnique({ where: { id: employeeId }, select: { fullName: true } }) : null;
  if (employeeId && !employee) return text("Karyawan tidak ditemukan", 404);

  const rows = await listReimburseExportRows(prisma, yearMonth, employeeId);
  // Jejak export (hardening Tahap 6) + alarm akses besar-besaran.
  const alert = await recordDataAccess(
    prisma,
    {
      actorId: user.id,
      actorName: user.name,
      action: "EXPORT",
      entity: "Reimbursement",
      entityId: `${yearMonth}:${employeeId ?? "semua"}`,
      after: { format: "xlsx", bulan: yearMonth, karyawan: employee?.fullName ?? "Semua karyawan", baris: rows.length },
    },
    requestMeta(request.headers),
  );
  await enqueueSecurityAlert(prisma, alert);
  const monthLabel = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${yearMonth}-01T00:00:00Z`));
  const who = employee?.fullName ?? "Semua karyawan";
  const data = await buildReimburseWorkbook(rows, `Rekap Reimburse ${monthLabel} — ${who}`);

  const fileName = `Reimburse ${yearMonth} - ${who}.xlsx`;
  const asciiName = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Length": String(data.length),
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
