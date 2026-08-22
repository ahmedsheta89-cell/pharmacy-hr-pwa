import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const fixture = vi.hoisted(() => {
  const inserted: Record<string, unknown>[] = [];
  const existing: Array<{ id: number }> = [];
  return {
    inserted,
    existing,
    db: {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => existing }) }) }),
      insert: () => ({ values: async (values: Record<string, unknown>) => { inserted.push(values); } }),
    },
  };
});

vi.mock("./db", () => ({ getDb: async () => fixture.db }));

import { appRouter } from "./routers";

function ownerContext(): TrpcContext {
  return {
    user: { id: 1, openId: "branch-owner", name: "مالك الاختبار", email: "owner@example.com", loginMethod: "test", role: "owner", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("إنشاء الفروع", () => {
  it("يسمح للمالك بحفظ كود فرع قصير ويطبّع حروفه", async () => {
    fixture.inserted.length = 0;
    fixture.existing.length = 0;
    await expect(appRouter.createCaller(ownerContext()).organization.createBranch({ name: "فرع المنصورة", code: "1", address: "المنصورة" })).resolves.toEqual({ success: true, existing: false });
    expect(fixture.inserted[0]).toMatchObject({ name: "فرع المنصورة", code: "1", address: "المنصورة" });
  });

  it("يختار الفرع الموجود عند تكرار الكود بدلاً من كشف خطأ قاعدة البيانات", async () => {
    fixture.inserted.length = 0;
    fixture.existing.splice(0, fixture.existing.length, { id: 1 });
    await expect(appRouter.createCaller(ownerContext()).organization.createBranch({ name: "فرع المنصورة", code: "1" })).resolves.toEqual({ success: true, existing: true });
    expect(fixture.inserted).toHaveLength(0);
  });

  it("يعيد رسالة مفهومة عندما يكون كود الفرع فارغاً", async () => {
    fixture.existing.length = 0;
    await expect(appRouter.createCaller(ownerContext()).organization.createBranch({ name: "فرع المنصورة", code: "", address: "المنصورة" })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "أدخل كوداً للفرع." });
  });
});
