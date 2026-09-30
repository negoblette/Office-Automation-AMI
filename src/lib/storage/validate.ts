// Validasi file upload: PDF/JPG/PNG, maks MAX_UPLOAD_MB (default 5 MB).
// Jenis file dideteksi dari isi (magic bytes), bukan dari nama/ekstensi (Tech Spec §5).

export type FileExtension = "pdf" | "jpg" | "png";

export const MIME_TYPES: Record<FileExtension, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  png: "image/png",
};

const SIGNATURES: { ext: FileExtension; bytes: number[] }[] = [
  { ext: "pdf", bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  { ext: "png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { ext: "jpg", bytes: [0xff, 0xd8, 0xff] },
];

export const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB ?? 5);
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

/** Deteksi jenis file dari byte awal; null jika bukan PDF/JPG/PNG. */
export function detectFileType(bytes: Uint8Array): FileExtension | null {
  const match = SIGNATURES.find(({ bytes: signature }) => signature.every((byte, i) => bytes[i] === byte));
  return match?.ext ?? null;
}

export type UploadValidation =
  | { ok: true; ext: FileExtension; mimeType: string }
  | { ok: false; error: string };

export function validateUpload(bytes: Uint8Array, maxBytes = MAX_UPLOAD_BYTES): UploadValidation {
  if (bytes.length === 0) return { ok: false, error: "File kosong" };
  if (bytes.length > maxBytes) {
    return { ok: false, error: `Ukuran file maksimal ${Math.round(maxBytes / 1024 / 1024)} MB` };
  }
  const ext = detectFileType(bytes);
  if (!ext) return { ok: false, error: "File harus berupa PDF, JPG, atau PNG" };
  return { ok: true, ext, mimeType: MIME_TYPES[ext] };
}
