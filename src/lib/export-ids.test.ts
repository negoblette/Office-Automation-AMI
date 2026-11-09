import { describe, expect, it } from "vitest";
import { EXPORTABLE_STATUSES, exportOwnerFilter, MAX_EXPORT_IDS, parseExportIds } from "./export-ids";

describe("pilihan ekspor (2026-11-09)", () => {
  it("id unik berformat cuid saja, maksimal MAX_EXPORT_IDS", () => {
    expect(parseExportIds("a1, b2,,a1,../x,c 3")).toEqual(["a1", "b2"]);
    expect(parseExportIds(null)).toEqual([]);
    expect(parseExportIds(Array.from({ length: MAX_EXPORT_IDS + 5 }, (_, i) => `id${i}`).join(","))).toHaveLength(MAX_EXPORT_IDS);
  });

  it("draft & yang ditolak tidak diekspor", () => {
    expect([...EXPORTABLE_STATUSES]).toEqual(["PENDING", "APPROVED"]);
  });

  it("selain Admin hanya miliknya sendiri", () => {
    expect(exportOwnerFilter({ role: "ADMIN", employeeId: null })).toEqual({});
    expect(exportOwnerFilter({ role: "STAFF", employeeId: "e1" })).toEqual({ employeeId: "e1" });
    expect(exportOwnerFilter({ role: "APPROVER", employeeId: null })).toEqual({ employeeId: "__none__" });
  });
});
