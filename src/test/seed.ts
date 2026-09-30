// Isi database test dengan seed yang SAMA seperti development (user, master data, approval flow).
import argon2 from "argon2";
import { seedAll } from "../../prisma/seed-lib";
import { resetDb, testDb } from "./db";

let passwordHash: string | undefined;

/** Kosongkan DB test lalu jalankan seed. Mengembalikan user id per key (yosep, rudy, andi, …). */
export async function resetAndSeed() {
  await resetDb();
  passwordHash ??= await argon2.hash("Rahasia123!");
  return seedAll(testDb, passwordHash, { log: false });
}
