import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const fixture = vi.hoisted(() => {
  const run = { id: 91, branchId: 7, status: "pending_manager", approvedByEmployeeId: null, approvedAt: null } as Record<string, unknown>;
  const approvals: Record<string, unknown>[] = [];
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [run] }) }) }),
    insert: () => ({ values: async (values: Record<string, unknown>) => { approvals.push(values); } }),
    update: () => ({ set: (values: Record<string, unknown>) => ({ where: async () => Object.assign(run, values) }) }),
  };
  return { db, run, approvals };
});

vi.mock("./db", () => ({
  getDb: async () => fixture.db,
  getEmployeeByUserId: async () => ({ id: 44, branchId: 7 }),
}));

import { appRouter } from "./routers";

function context(role: string): TrpcContext {
  return {
    user: { id: 8, openId: `approval-${role}`, name: "مستخدم اختبار", email: "test@example.com", loginMethod: "test", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("صلاحيات tRPC لاعتماد الرواتب ولوحة KPIs", () => {
  beforeEach(() => {
    fixture.approvals.length = 0;
    Object.assign(fixture.run, { id: 91, branchId: 7, status: "pending_manager", approvedByEmployeeId: null, approvedAt: null });
  });

  it("يمنع الموظف والصيدلاني من اعتماد الرواتب", async () => {
    await expect(appRouter.createCaller(context("user")).payroll.reviewByManager({ payrollRunId: 91, decision: "approved" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(context("pharmacist")).payroll.reviewByHr({ payrollRunId: 91, decision: "approved" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("يفصل مرحلة المدير المباشر عن مرحلة الموارد البشرية", async () => {
    await expect(appRouter.createCaller(context("hr_manager")).payroll.reviewByManager({ payrollRunId: 91, decision: "approved" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(context("manager")).payroll.reviewByHr({ payrollRunId: 91, decision: "approved" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("يسمح للمدير بإحالة المسير إلى الموارد البشرية ثم يسمح لها باعتماده", async () => {
    const managerResult = await appRouter.createCaller(context("manager")).payroll.reviewByManager({ payrollRunId: 91, decision: "approved", note: "مراجعة المدير مكتملة" });
    expect(managerResult).toMatchObject({ success: true, status: "pending_hr" });
    expect(fixture.run.status).toBe("pending_hr");
    expect(fixture.approvals).toHaveLength(1);

    const hrResult = await appRouter.createCaller(context("hr_manager")).payroll.reviewByHr({ payrollRunId: 91, decision: "approved", note: "اعتماد الموارد البشرية مكتمل" });
    expect(hrResult).toMatchObject({ success: true, status: "approved" });
    expect(fixture.run.status).toBe("approved");
    expect(fixture.approvals).toHaveLength(2);
  });

  it("يحمي تقرير KPIs من حسابات غير الإدارة", async () => {
    await expect(appRouter.createCaller(context("user")).analytics.kpiDashboard({ branchId: 7 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
