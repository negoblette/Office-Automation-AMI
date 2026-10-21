// Validasi file upload: hanya PDF (2026-10-12; sebelumnya juga JPG/PNG), maks MAX_UPLOAD_MB (default 5 MB).
// JPG/PNG tetap dikenali supaya file lama tetap bisa diunduh dan pesan error jelas.
// Jenis file dideteksi dari isi (magic bytes), bukan dari nama/ekstensi (Tech Spec §5).
// PDF berisi JavaScript / aksi berbahaya ditolak (hardening Tahap 7, lihat `pdfActiveContent`).
import { inflateSync } from "node:zlib";

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
  if (ext !== "pdf") return { ok: false, error: "File harus berupa PDF" };
  if (pdfActiveContent(bytes)) {
    return {
      ok: false,
      error: "PDF berisi JavaScript, lampiran tersembunyi, atau aksi otomatis yang tidak diizinkan. Simpan ulang lewat Print → Save as PDF, lalu upload lagi.",
    };
  }
  return { ok: true, ext, mimeType: MIME_TYPES[ext] };
}

/**
 * Kata kunci PDF yang bisa menjalankan sesuatu saat file dibuka (OWASP File Upload Cheat Sheet, Didier Stevens pdfid):
 * JavaScript, menjalankan program, mengirim/mengambil data form, file tersemat, media/Flash, dan form XFA (bisa berisi
 * skrip). Link biasa (/URI) & /OpenAction untuk zoom/halaman awal tetap boleh — yang ditolak jenis aksinya.
 */
const ACTIVE_PDF_KEYS = ["JavaScript", "JS", "Launch", "SubmitForm", "ImportData", "EmbeddedFile", "EmbeddedFiles", "RichMedia", "XFA"];
const ACTIVE_PDF_PATTERN = new RegExp(String.raw`/(${ACTIVE_PDF_KEYS.join("|")})(?=[\s/<>\[\]()%{}]|$)`);

/** Nama PDF boleh ditulis dengan escape heksadesimal (`/J#61vaScript`) — dibuka dulu sebelum dicocokkan. */
function decodePdfNames(text: string): string {
  return text.replace(/#([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Kata kunci aktif pertama yang ditemukan di PDF, atau null. Diperiksa di teks mentah DAN di isi stream terkompresi
 * (FlateDecode, termasuk object stream PDF 1.5+ tempat kamus aksi bisa disembunyikan).
 */
export function pdfActiveContent(bytes: Uint8Array): string | null {
  const raw = Buffer.from(bytes).toString("latin1");
  const scan = (text: string) => ACTIVE_PDF_PATTERN.exec(decodePdfNames(text))?.[1] ?? null;
  const found = scan(raw);
  if (found) return found;

  const streamPattern = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = streamPattern.exec(raw))) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    try {
      const inflated = inflateSync(Buffer.from(bytes.subarray(start, end)), { maxOutputLength: 50 * 1024 * 1024 }).toString("latin1");
      const hit = scan(inflated);
      if (hit) return hit;
    } catch {
      // Bukan FlateDecode / data gambar — lewati.
    }
    streamPattern.lastIndex = end;
  }
  return null;
}
