import { getCurrentUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { canAccessFile, prismaFileAccessRepository } from "@/lib/services/file-access";
import { FileNotFoundError, getStorage, isValidFileKey } from "@/lib/storage";

const fileAccess = prismaFileAccessRepository(prisma);

function text(message: string, status: number) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

/** Unduh/lihat file upload. Hanya Admin atau karyawan pemilik file (Tech Spec §8). */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const user = await getCurrentUser();
  if (!user) return text("Silakan login terlebih dahulu", 401);

  const { key } = await params;
  if (!isValidFileKey(key)) return text("File tidak ditemukan", 404);

  const owner = await fileAccess.findFileOwner(key);
  if (!owner) return text("File tidak ditemukan", 404);
  if (!canAccessFile(user, owner)) return text("Anda tidak berhak mengakses file ini", 403);

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
    },
  });
}
