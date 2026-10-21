// Helper test (hardening Tahap 7): file hanya bisa ditautkan oleh pengunggahnya (`UploadedFile`). Test service yang
// memakai key file buatan sendiri menandainya sebagai upload milik aktor yang menautkan.
import type { Actor } from "@/lib/services/access";
import { testDb } from "./db";

/** Tandai key sebagai hasil upload `uploaderId`. Key yang sudah tercatat dibiarkan (pengunggah aslinya tetap). */
export async function asUploadedBy(uploaderId: string, ...keys: (string | null | undefined)[]): Promise<void> {
  const data = keys.filter((key): key is string => Boolean(key)).map((key) => ({ key, uploaderId, sizeBytes: 10 }));
  if (data.length) await testDb.uploadedFile.createMany({ data, skipDuplicates: true });
}

/** Bungkus fungsi service `(db, actor, …, input)` supaya `input.fileKey` tercatat sebagai upload aktor itu dulu. */
export function withUpload<A extends unknown[], R>(
  fn: (db: typeof testDb, actor: Actor, ...rest: A) => Promise<R>,
): (actor: Actor, ...rest: A) => Promise<R> {
  return async (actor, ...rest) => {
    const input = rest[rest.length - 1] as { fileKey?: string | null } | undefined;
    await asUploadedBy(actor.id, input?.fileKey);
    return fn(testDb, actor, ...rest);
  };
}
