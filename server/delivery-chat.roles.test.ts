import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { describe, expect, it } from "vitest";

function employeeContext(): TrpcContext {
  return {
    user: { id: 91, openId: "delivery-role-test", email: "employee@example.com", name: "موظف اختبار", loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("delivery and chat access control", () => {
  it("blocks a regular account from branch delivery management", async () => {
    const caller = appRouter.createCaller(employeeContext());
    await expect(caller.delivery.list({ branchId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks a regular account from the customer message inbox", async () => {
    const caller = appRouter.createCaller(employeeContext());
    await expect(caller.chat.inbox()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
