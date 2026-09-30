import { describe, expect, it } from "vitest";
import { type AuditDb, logAudit, toAuditJson } from "@/lib/services/audit";

/** Fake db yang menyimpan argumen `auditLog.create`, sama seperti `prisma` atau `tx`. */
function fakeDb() {
  const created: unknown[] = [];
  const db = {
    auditLog: {
      create: async (args: { data: unknown }) => {
        created.push(args.data);
        return args.data;
      },
    },
  } as unknown as AuditDb;
  return { db, created };
}

describe("toAuditJson", () => {
  it("BigInt → string dengan presisi utuh, Date → ISO string", () => {
    expect(
      toAuditJson({ total: 9_007_199_254_740_993n, submittedAt: new Date("2026-09-24T02:42:00Z") }),
    ).toEqual({ total: "9007199254740993", submittedAt: "2026-09-24T02:42:00.000Z" });
  });

  it("field sensitif dibuang, termasuk yang bersarang", () => {
    expect(
      toAuditJson({ email: "andi@artha-mitra.local", passwordHash: "$argon2id$...", user: { password: "x", role: "STAFF" } }),
    ).toEqual({ email: "andi@artha-mitra.local", user: { role: "STAFF" } });
  });

  it("array & nilai kosong", () => {
    expect(toAuditJson({ items: [{ amount: 1n }, null], note: undefined, approvedAt: null })).toEqual({
      items: [{ amount: "1" }, null],
      approvedAt: null,
    });
    expect(toAuditJson(undefined)).toBeNull();
  });
});

describe("logAudit", () => {
  it("menulis entri dengan before/after yang sudah aman disimpan", async () => {
    const { db, created } = fakeDb();

    await logAudit(db, {
      actorId: "u-admin",
      action: "UPDATE",
      entity: "Employee",
      entityId: "e1",
      before: { position: "Engineer", passwordHash: "rahasia" },
      after: { position: "Senior Engineer", updatedAt: new Date("2026-09-25T00:00:00Z") },
    });

    expect(created).toEqual([
      {
        userId: "u-admin",
        action: "UPDATE",
        entity: "Employee",
        entityId: "e1",
        before: { position: "Engineer" },
        after: { position: "Senior Engineer", updatedAt: "2026-09-25T00:00:00.000Z" },
      },
    ]);
  });

  it("tanpa before/after (mis. LOGIN) → kolom dibiarkan kosong", async () => {
    const { db, created } = fakeDb();

    await logAudit(db, { actorId: "u1", action: "LOGIN", entity: "User", entityId: "u1" });

    expect(created).toEqual([
      { userId: "u1", action: "LOGIN", entity: "User", entityId: "u1", before: undefined, after: undefined },
    ]);
  });

  it("aksi sistem tanpa pelaku", async () => {
    const { db, created } = fakeDb();

    await logAudit(db, { actorId: null, action: "CREATE", entity: "LeaveBalance", entityId: "lb1", after: { days: 12 } });

    expect(created[0]).toMatchObject({ userId: null, action: "CREATE", after: { days: 12 } });
  });
});
