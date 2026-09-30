import { describe, expect, it } from "vitest";
import { canAccessFile, type FileOwner } from "@/lib/services/file-access";

const andiFile: FileOwner = { employeeId: "emp-andi", fileName: "ktp.pdf", mimeType: "application/pdf" };
const candidateFile: FileOwner = { employeeId: null, fileName: "cv.pdf", mimeType: "application/pdf" };

const admin = { role: "ADMIN" as const, employeeId: "emp-yosep" };
const andi = { role: "STAFF" as const, employeeId: "emp-andi" };
const sinta = { role: "STAFF" as const, employeeId: "emp-sinta" };
const staffWithoutEmployee = { role: "STAFF" as const, employeeId: null };

describe("canAccessFile", () => {
  it("Admin boleh semua file (termasuk sebagai approver)", () => {
    expect(canAccessFile(admin, andiFile)).toBe(true);
    expect(canAccessFile(admin, candidateFile)).toBe(true);
  });

  it("Staf boleh file miliknya sendiri", () => {
    expect(canAccessFile(andi, andiFile)).toBe(true);
  });

  it("Staf tidak boleh file karyawan lain", () => {
    expect(canAccessFile(sinta, andiFile)).toBe(false);
  });

  it("file tanpa pemilik karyawan (kandidat) hanya Admin", () => {
    expect(canAccessFile(andi, candidateFile)).toBe(false);
    expect(canAccessFile(staffWithoutEmployee, candidateFile)).toBe(false);
  });
});
