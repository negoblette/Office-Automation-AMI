import { getReadyUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { enqueueSecurityAlert } from "@/lib/mail/security-emails";
import { requestMeta } from "@/lib/request-meta";
import { canAccessFile, prismaFileAccessRepository } from "@/lib/services/file-access";
import { recordDataAccess } from "@/lib/services/security-monitor";
import { FileNotFoundError, getStorage, isValidFileKey } from "@/lib/storage";

const fileAccess = prismaFileAccessRepository(prisma);

/**
 * Header pengaman untuk file upload yang dibuka di browser (hardening Tahap 7; OWASP Secure Headers): tanpa skrip, form,
 * atau koneksi ke luar dari dokumen itu. `sandbox` hanya untuk gambar lama — penampil PDF bawaan Chrome/Edge diperlakukan
 * sebagai plugin yang selalu dimatikan di dokumen ber-sandbox, jadi PDF memakai CSP ketat tanpa `sandbox` (JavaScript di
 * PDF sendiri sudah ditolak saat upload). `object-src 'self'` = penampil PDF memuat file ini sendiri. X-Frame-Options,
 * Referrer-Policy, COOP & CORP sudah dipasang untuk semua respons di next.config.ts.
 */
function fileSecurityHeaders(mimeType: string): Record<string, string> {
  const base = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'";
  return {
    "Content-Security-Policy": mimeType === "application/pdf" ? `${base}; object-src 'self'` : `${base}; sandbox`,
    // IE/Edge lama: jangan tawarkan "Open" langsung dari dialog unduh; Flash/Acrobat lama: tanpa kebijakan lintas domain.
    "X-Download-Options": "noopen",
    "X-Permitted-Cross-Domain-Policies": "none",
  };
}

function text(message: string, status: number) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

/** Unduh/lihat file upload. Hanya Admin atau karyawan pemilik file (Tech Spec §8). */
export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const user = await getReadyUser();
  if (!user) return text("Silakan login terlebih dahulu", 401);

  const { key } = await params;
  if (!isValidFileKey(key)) return text("File tidak ditemukan", 404);

  const owner = await fileAccess.findFileOwner(key);
  if (!owner) return text("File tidak ditemukan", 404);
  if (!canAccessFile(user, owner)) return text("Anda tidak berhak mengakses file ini", 403);

  // Jejak unduhan (hardening Tahap 6): siapa, file apa, dari IP & perangkat mana; banyak unduhan → alarm Admin.
  const meta = requestMeta(request.headers);
  const alert = await recordDataAccess(
    prisma,
    { actorId: user.id, actorName: user.name, action: "DOWNLOAD", entity: "File", entityId: key, after: { fileName: owner.fileName } },
    meta,
  );
  await enqueueSecurityAlert(prisma, alert);

  let data: Uint8Array;
  try {
    data = await getStorage().get(key);
  } catch (error) {
    if (error instanceof FileNotFoundError) return text("File tidak ditemukan", 404);
    throw error;
  }

  const asciiName = owner.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": owner.mimeType,
      "Content-Length": String(data.length),
      "Content-Disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(owner.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // Hardening Tahap 7: file dibuka sebagai dokumen terisolasi — tanpa skrip, form, plugin, atau koneksi ke luar,
      // walau isinya berbahaya (OWASP File Upload / Secure Headers). Tidak boleh disematkan situs lain.
      ...fileSecurityHeaders(owner.mimeType),
    },
  });
}
