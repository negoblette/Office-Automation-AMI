"use client";

import { createContext, useContext, useMemo } from "react";

export type DivisionItem = { code: string; name: string; isActive: boolean };

const DivisionsContext = createContext<DivisionItem[]>([]);

/** Daftar divisi (master, 2026-10-12) untuk Client Component — diisi sekali di layout `(main)`. */
export function DivisionsProvider({ divisions, children }: { divisions: DivisionItem[]; children: React.ReactNode }) {
  return <DivisionsContext.Provider value={divisions}>{children}</DivisionsContext.Provider>;
}

/** `options` = divisi aktif untuk dropdown; `label(code)` = nama divisi (termasuk yang nonaktif). */
export function useDivisions() {
  const divisions = useContext(DivisionsContext);
  return useMemo(() => {
    const names = new Map(divisions.map((d) => [d.code, d.name]));
    return {
      options: divisions.filter((d) => d.isActive).map((d) => ({ value: d.code, label: d.name })),
      label: (code: string | null | undefined) => (code ? (names.get(code) ?? code) : "—"),
    };
  }, [divisions]);
}
