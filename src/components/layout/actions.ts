"use server";

import { signOut } from "@/lib/auth";

/** Logout lalu kembali ke halaman login. */
export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
