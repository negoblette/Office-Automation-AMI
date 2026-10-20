import { describe, expect, it } from "vitest";
import { passwordProblem } from "@/lib/password-policy";

describe("passwordProblem (hardening 2026-10)", () => {
  it("menerima kalimat panjang", () => {
    expect(passwordProblem("lampu merah di depan pasar baru")).toBeNull();
  });

  it("menolak satu karakter yang diulang", () => {
    expect(passwordProblem("aaaaaaaaaaaaaaaa")).toMatch(/diulang/);
  });

  it("menolak deret maju & mundur", () => {
    expect(passwordProblem("123456789012345")).toMatch(/deret/);
    expect(passwordProblem("qwertyuiopasdfgh")).toMatch(/deret/);
    expect(passwordProblem("543210987654321")).toMatch(/deret/);
  });

  it("menolak kata umum yang hanya ditambah angka/simbol", () => {
    expect(passwordProblem("Password2026!!!!")).toMatch(/terlalu umum/);
    expect(passwordProblem("Bismillah 12345!")).toMatch(/terlalu umum/);
  });

  it("menolak password yang memuat nama atau email pemilik", () => {
    expect(passwordProblem("andipratama2026!!", ["andi", "Andi Pratama"])).toMatch(/nama atau email/);
  });
});
