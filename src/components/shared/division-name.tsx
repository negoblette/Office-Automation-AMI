"use client";

import { useDivisions } from "./divisions-context";

/** Nama divisi dari kode (untuk sel tabel yang didefinisikan di luar komponen). */
export function DivisionName({ code }: { code: string | null | undefined }) {
  return <>{useDivisions().label(code)}</>;
}
