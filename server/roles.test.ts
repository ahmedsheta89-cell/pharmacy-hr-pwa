import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createContext(role: "user" | "manager" | "admin"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "role-test-user",
      email: "role-test@example.com",
      name: "Role Test",
      loginMethod: "manus",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("role-based access", () => {
  it("blocks a regular employee from adding a branch", async () => {
    const caller = appRouter.createCaller(createContext("user"));

    await expect(caller.organization.createBranch({ name: "فرع الاختبار", code: "TEST-01" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("blocks a manager from owner-only branch administration", async () => {
    const caller = appRouter.createCaller(createContext("manager"));

    await expect(caller.organization.createBranch({ name: "فرع الاختبار", code: "TEST-02" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
