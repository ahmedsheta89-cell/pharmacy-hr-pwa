import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const fixture = vi.hoisted(() => {
  const updated: Record<string, unknown>[] = [];
  const employee = { id: 7, userId: null, branchId: 1, employeeCode: "13", fullName: "إبراهيم", phone: null, email: null, jobTitle: "مساعد", role: "employee", hireDate: new Date("2026-08-06"), nationalId: null, employmentStatus: "active" };
  const employeeRows = [employee];
  return {
    updated,
    employees: employeeRows,
    db: {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => employeeRows }) }) }),
      update: () => ({ set: (values: Record<string, unknown>) => ({ where: async () => { updated.push(values); } }) }),
    },
  };
});

vi.mock("./db", () => ({ getDb: async () => fixture.db, getEmployeeByUserId: async () => ({ id: 2, branchId: 1 }) }));

import { appRouter } from "./routers";

function context(role: "owner" | "employee"): TrpcContext {
  return { user: { id: 1, openId: `test-${role}`, name: "اختبار", email: "test@example.com", loginMethod: "test", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: () => undefined } as TrpcContext["res"] };
}

describe("دورة حياة الموظف", () => {
  it("يسمح للمالك بتعديل بيانات الموظف", async () => {
    fixture.updated.length = 0;
    await expect(appRouter.createCaller(context("owner")).employees.update({ employeeId: 7, employeeCode: "13", fullName: "إبراهيم المعدل", jobTitle: "مساعد صيدلي", role: "employee", hireDate: new Date("2026-08-06") })).resolves.toEqual({ success: true });
    expect(fixture.updated[0]).toMatchObject({ fullName: "إبراهيم المعدل", jobTitle: "مساعد صيدلي" });
  });

  it("يؤرشف الموظف بدلاً من حذفه", async () => {
    fixture.updated.length = 0;
    await expect(appRouter.createCaller(context("owner")).employees.archive({ employeeId: 7 })).resolves.toEqual({ success: true });
    expect(fixture.updated[0]).toMatchObject({ employmentStatus: "inactive" });
  });

  it("يرفض تعديل الموظف من دور غير إداري", async () => {
    await expect(appRouter.createCaller(context("employee")).employees.update({ employeeId: 7, employeeCode: "13", fullName: "إبراهيم المعدل", jobTitle: "مساعد", role: "employee", hireDate: new Date("2026-08-06") })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
