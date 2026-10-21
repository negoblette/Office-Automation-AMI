import { prisma } from "@/lib/db";

/**
 * Pemantauan aplikasi (hardening Tahap 6): dipakai healthcheck Docker & alat uptime (mis. Uptime Kuma). Tanpa login,
 * jadi sengaja tidak memuat detail (versi, nama host, pesan error) — hanya "ok" / "error".
 */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", database: "ok" }, { headers });
  } catch (error) {
    console.error("[health] database tidak bisa dihubungi", error);
    return Response.json({ status: "error", database: "error" }, { status: 503, headers });
  }
}
