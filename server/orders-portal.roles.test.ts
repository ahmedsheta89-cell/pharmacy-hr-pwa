import { describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

function employeeContext(): TrpcContext {
  return {
    user: { id: 71, openId: "orders-role-user", email: "employee@example.test", name: "موظف", loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("صلاحيات بوابة الطلبات", () => {
  it("لا يمنح حساب موظف عادي حق إدارة حساب الصيدلية أو الأسماء أو الطلبات", async () => {
    const caller = appRouter.createCaller(employeeContext());
    await expect(caller.orders.admin.account({ branchId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.orders.admin.saveAccount({ branchId: 1, phoneUsername: "01000000000", password: "password-123" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.orders.admin.saveStaff({ branchId: 1, fullName: "اسم اختبار" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.orders.admin.list({ branchId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("يبقي جلسة البوابة العامة مغلقة عند غياب ملف تعريف الارتباط الموقّع", async () => {
    const caller = appRouter.createCaller(employeeContext());
    await expect(caller.orders.portal.session()).resolves.toEqual({ authenticated: false, account: null });
  });
});
