import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const fixture = vi.hoisted(() => {
  const updated: Record<string, unknown>[] = [];
  const auditEvents: Record<string, unknown>[] = [];
  const auditRows = [{ id: 31, employeeId: 7, action: "updated", actorUserId: 1, actorName: "اختبار", changes: [{ field: "fullName", label: "الاسم", before: "إبراهيم", after: "إبراهيم المعدل" }], createdAt: new Date("2026-08-22T09:00:00Z") }];
  const selectResults: Record<string, unknown>[][] = [];
  const employee = { id: 7, userId: null, branchId: 1, employeeCode: "13", fullName: "إبراهيم", phone: null, email: null, jobTitle: "مساعد", role: "employee", hireDate: new Date("2026-08-06"), nationalId: null, employmentStatus: "active", isActive: "yes" };
  const employeeRows = [employee];
  const query = () => {
    const rows = selectResults.shift() ?? employeeRows;
    const ordered = { limit: async () => auditRows, then: (resolve: (value: typeof auditRows) => unknown) => Promise.resolve(auditRows).then(resolve) };
    return { limit: async () => rows, then: (resolve: (value: typeof rows) => unknown) => Promise.resolve(rows).then(resolve), orderBy: () => ordered };
  };
  return {
    updated,
    auditEvents,
    auditRows,
    selectResults,
    dashboardRows: new Map<unknown, Record<string, unknown>[]>(),
    employees: employeeRows,
    linkedEmployee: { id: 2, branchId: 1 },
      db: {
      select: () => ({ from: (table: unknown) => {
        if (fixture.dashboardRows.has(table)) {
          const controlledRows = fixture.dashboardRows.get(table) ?? [];
          const controlledOrdered = { limit: async () => controlledRows, then: (resolve: (value: typeof controlledRows) => unknown) => Promise.resolve(controlledRows).then(resolve) };
          const controlledQuery = () => ({ limit: async () => controlledRows, then: (resolve: (value: typeof controlledRows) => unknown) => Promise.resolve(controlledRows).then(resolve), orderBy: () => controlledOrdered });
          const controlledJoined = { innerJoin: () => controlledJoined, leftJoin: () => controlledJoined, where: () => controlledQuery(), orderBy: () => controlledOrdered };
          return { where: () => controlledQuery(), innerJoin: () => controlledJoined, orderBy: () => controlledOrdered, then: (resolve: (value: typeof controlledRows) => unknown) => Promise.resolve(controlledRows).then(resolve) };
        }
        const rootOrdered = { limit: async () => auditRows, then: (resolve: (value: typeof auditRows) => unknown) => Promise.resolve(auditRows).then(resolve) };
        const joined = { innerJoin: () => joined, leftJoin: () => joined, where: () => query(), orderBy: () => ({ then: (resolve: (value: typeof auditRows) => unknown) => Promise.resolve(auditRows).then(resolve) }) };
        return { where: () => query(), innerJoin: () => joined, orderBy: () => rootOrdered, then: (resolve: (value: unknown) => unknown) => query().then(resolve) };
      } }),
      update: () => ({ set: (values: Record<string, unknown>) => ({ where: async () => { updated.push(values); } }) }),
      insert: () => ({ values: async (values: Record<string, unknown>) => { auditEvents.push(values); return [{ insertId: 44 }]; } }),
    },
  };
});

vi.mock("./db", () => ({ getDb: async () => fixture.db, getEmployeeByUserId: async () => fixture.linkedEmployee }));

import { appRouter } from "./routers";
import { accountLinkRequests, attendanceRecords, branches, employees, kpiRecords, leaveBalances, leaveRequests, payrollRuns, shiftAssignments } from "../drizzle/schema";

function context(role: "owner" | "manager" | "hr_manager" | "employee"): TrpcContext {
  return { user: { id: 1, openId: `test-${role}`, name: "اختبار", email: "test@example.com", loginMethod: "test", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: () => undefined } as TrpcContext["res"] };
}

describe("دورة حياة الموظف", () => {
  it("يعيد عدّادات مهام المالك ومدير الفرع ومدير الموارد البشرية ضمن النطاق المصرح", async () => {
    try {
      fixture.dashboardRows.set(branches, [{ id: 1 }]);
      fixture.dashboardRows.set(employees, [{ id: 7 }]);
      fixture.dashboardRows.set(kpiRecords, []);
      fixture.dashboardRows.set(accountLinkRequests, [{ id: 10 }]);
      fixture.dashboardRows.set(leaveRequests, [{ id: 11 }, { id: 12 }]);
      fixture.dashboardRows.set(payrollRuns, [{ id: 21, status: "pending_manager" }]);
      await expect(appRouter.createCaller(context("owner")).dashboard.overview()).resolves.toMatchObject({ taskBadges: { accountLinks: 1, leaves: 2, payroll: 1 } });

      fixture.dashboardRows.clear();
      fixture.dashboardRows.set(employees, [{ ...fixture.employees[0], id: 7, branchId: 1 }]);
      fixture.dashboardRows.set(attendanceRecords, []);
      fixture.dashboardRows.set(shiftAssignments, []);
      fixture.dashboardRows.set(leaveRequests, [{ employeeId: 7, status: "pending" }]);
      fixture.dashboardRows.set(payrollRuns, [{ id: 31, status: "pending_manager" }, { id: 32, status: "pending_hr" }]);
      await expect(appRouter.createCaller(context("manager")).dashboard.overview()).resolves.toMatchObject({ taskBadges: { accountLinks: 0, leaves: 1, payroll: 1 } });

      fixture.dashboardRows.clear();
      fixture.dashboardRows.set(shiftAssignments, []);
      fixture.dashboardRows.set(attendanceRecords, []);
      fixture.dashboardRows.set(leaveBalances, []);
      fixture.dashboardRows.set(kpiRecords, []);
      fixture.dashboardRows.set(payrollRuns, [{ id: 41, status: "pending_hr" }, { id: 42, status: "pending_manager" }]);
      await expect(appRouter.createCaller(context("hr_manager")).dashboard.overview()).resolves.toMatchObject({ taskBadges: { accountLinks: 0, leaves: 0, payroll: 1 } });
    } finally {
      fixture.dashboardRows.clear();
    }
  });

  it("يسمح للمالك بتعديل بيانات الموظف", async () => {
    fixture.updated.length = 0;
    fixture.auditEvents.length = 0;
    await expect(appRouter.createCaller(context("owner")).employees.update({ employeeId: 7, employeeCode: "13", fullName: "إبراهيم المعدل", jobTitle: "مساعد صيدلي", role: "employee", hireDate: new Date("2026-08-06") })).resolves.toEqual({ success: true });
    expect(fixture.updated[0]).toMatchObject({ fullName: "إبراهيم المعدل", jobTitle: "مساعد صيدلي" });
    expect(fixture.auditEvents[0]?.changes).not.toEqual(expect.arrayContaining([expect.objectContaining({ field: "employmentStatus" })]));
  });

  it("يؤرشف الموظف بدلاً من حذفه", async () => {
    fixture.updated.length = 0;
    fixture.auditEvents.length = 0;
    await expect(appRouter.createCaller(context("owner")).employees.archive({ employeeId: 7 })).resolves.toEqual({ success: true });
    expect(fixture.updated[0]).toMatchObject({ employmentStatus: "inactive" });
    expect(fixture.auditEvents[0]).toMatchObject({ employeeId: 7, action: "archived" });
  });

  it("يستعيد الموظف المؤرشف إلى الحالة النشطة مع تسجيل القرار", async () => {
    fixture.updated.length = 0;
    fixture.auditEvents.length = 0;
    await expect(appRouter.createCaller(context("owner")).employees.restore({ employeeId: 7 })).resolves.toEqual({ success: true });
    expect(fixture.updated[0]).toMatchObject({ employmentStatus: "active" });
    expect(fixture.auditEvents[0]).toMatchObject({ employeeId: 7, action: "restored" });
  });

  it("يربط البحث والمرشحات والفرز بقائمة الموظفين", async () => {
    const baseEmployee = fixture.employees[0];
    fixture.employees.splice(0, fixture.employees.length,
      { ...baseEmployee, id: 7, fullName: "إبراهيم", role: "employee", employmentStatus: "active" },
      { ...baseEmployee, id: 8, fullName: "ليلى", employeeCode: "PH-08", jobTitle: "صيدلانية", role: "pharmacist", employmentStatus: "active" },
      { ...baseEmployee, id: 9, fullName: "مروان", employeeCode: "PH-09", role: "pharmacist", employmentStatus: "on_leave" },
    );
    const result = await appRouter.createCaller(context("owner")).employees.list({ branchId: 1, search: "ليلى", role: "pharmacist", status: "active", sortBy: "name", sortDirection: "asc" });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 8, fullName: "ليلى" });
  });

  it("يعرض سجل التدقيق للمالك والمدير ويمنع الموظف غير الإداري", async () => {
    await expect(appRouter.createCaller(context("owner")).employees.auditLog({ employeeId: 7 })).resolves.toMatchObject([{ id: 31, action: "updated" }]);
    await expect(appRouter.createCaller(context("manager")).employees.auditLog({ employeeId: 7 })).resolves.toMatchObject([{ id: 31, action: "updated" }]);
    await expect(appRouter.createCaller(context("employee")).employees.auditLog({ employeeId: 7 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("يصفّي سجل التدقيق بالبحث داخل الحقول المتغيرة مع بقاء نطاق الموظف مفروضاً", async () => {
    fixture.auditRows.splice(0, fixture.auditRows.length,
      { id: 41, employeeId: 7, action: "updated", actorName: "المالك", changes: [{ label: "المسمى الوظيفي", before: "مساعد", after: "صيدلاني" }], createdAt: new Date("2026-08-22T09:00:00Z") },
      { id: 42, employeeId: 7, action: "archived", actorName: "المالك", changes: [{ label: "الحالة", before: "نشط", after: "مؤرشف" }], createdAt: new Date("2026-08-23T09:00:00Z") },
    );
    await expect(appRouter.createCaller(context("manager")).employees.auditLog({ employeeId: 7, action: "updated", search: "صيدلاني" })).resolves.toMatchObject([{ id: 41, action: "updated" }]);
  });

  it("يسمح للمالك بإنشاء ملفه الوظيفي وربط حسابه قبل تسجيل الحضور", async () => {
    fixture.auditEvents.length = 0;
    fixture.linkedEmployee = null;
    await expect(appRouter.createCaller(context("owner")).profile.setupEmployeeProfile({ branchId: 1 })).resolves.toMatchObject({ success: true, existing: false });
    expect(fixture.auditEvents[0]).toMatchObject({ userId: 1, branchId: 1, employeeCode: "ADM-1", jobTitle: "مالك النظام", role: "manager" });
    fixture.linkedEmployee = { id: 2, branchId: 1 };
  });

  it("يرفض إنشاء ملف المالك من حساب غير مصرح له", async () => {
    await expect(appRouter.createCaller(context("employee")).profile.setupEmployeeProfile({ branchId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("يربط المالك حساباً غير مرتبط ويوثق العملية ويرسل إشعاراً داخلياً", async () => {
    fixture.updated.length = 0;
    fixture.auditEvents.length = 0;
    await expect(appRouter.createCaller(context("owner")).employees.linkUser({ employeeId: 7, userId: 2 })).resolves.toEqual({ success: true, existing: false });
    expect(fixture.updated[0]).toMatchObject({ userId: 2 });
    expect(fixture.auditEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ employeeId: 7, userId: 2, action: "linked", source: "owner_direct" }),
      expect.objectContaining({ userId: 2, type: "account_linked" }),
    ]));
  });

  it("يتيح للمدير تقديم طلب ربط ويمنع المدير والموظف من الربط المباشر", async () => {
    fixture.selectResults.push([fixture.employees[0]], [{ id: 2 }], [], []);
    await expect(appRouter.createCaller(context("manager")).employees.requestUserLink({ employeeId: 7, userId: 2 })).resolves.toMatchObject({ success: true, existing: false, requestId: 44 });
    await expect(appRouter.createCaller(context("manager")).employees.linkUser({ employeeId: 7, userId: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(context("employee")).employees.requestUserLink({ employeeId: 7, userId: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("يعتمد المالك طلب الربط ويُسجل الربط ويرسل إشعاراً للموظف", async () => {
    fixture.updated.length = 0;
    fixture.auditEvents.length = 0;
    fixture.selectResults.push(
      [{ id: 51, employeeId: 7, userId: 2, branchId: 1, status: "pending" }],
      [fixture.employees[0]],
      [{ id: 2, name: "موظف الاختبار" }],
      [],
    );
    await expect(appRouter.createCaller(context("owner")).employees.reviewLinkRequest({ requestId: 51, decision: "approved" })).resolves.toEqual({ success: true, status: "approved" });
    expect(fixture.updated).toEqual(expect.arrayContaining([expect.objectContaining({ userId: 2 }), expect.objectContaining({ status: "approved" })]));
    expect(fixture.auditEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "linked", source: "owner_approved_request", requestId: 51 }),
      expect.objectContaining({ userId: 2, type: "account_linked" }),
    ]));
  });

  it("يسمح للمالك برفض طلب الربط دون تغيير ملف الموظف", async () => {
    fixture.updated.length = 0;
    fixture.selectResults.push([{ id: 52, employeeId: 7, userId: 2, branchId: 1, status: "pending" }]);
    await expect(appRouter.createCaller(context("owner")).employees.reviewLinkRequest({ requestId: 52, decision: "rejected", note: "بيانات الحساب غير مكتملة" })).resolves.toEqual({ success: true, status: "rejected" });
    expect(fixture.updated[0]).toMatchObject({ status: "rejected", reviewNote: "بيانات الحساب غير مكتملة" });
  });

  it("يفك المالك ربط الحساب ويوثق الإجراء", async () => {
    fixture.updated.length = 0;
    fixture.auditEvents.length = 0;
    fixture.employees[0].userId = 2;
    fixture.selectResults.push([fixture.employees[0]], [{ id: 2, name: "موظف الاختبار" }]);
    await expect(appRouter.createCaller(context("owner")).employees.unlinkUser({ employeeId: 7 })).resolves.toEqual({ success: true, existing: false });
    expect(fixture.updated[0]).toMatchObject({ userId: null });
    expect(fixture.auditEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "unlinked", source: "owner_direct", userId: 2 }),
      expect.objectContaining({ userId: 2, type: "account_unlinked" }),
    ]));
    fixture.employees[0].userId = null;
  });

  it("يعرض سجل عمليات الربط للنطاق الإداري ويتيح قراءة الإشعارات الشخصية", async () => {
    fixture.auditRows.splice(0, fixture.auditRows.length, { log: { id: 61, employeeId: 7, branchId: 1, action: "linked", source: "owner_direct", actorName: "اختبار", createdAt: new Date() }, employeeName: "إبراهيم", employeeCode: "13", accountName: "سارة", accountEmail: "sara@example.com" });
    await expect(appRouter.createCaller(context("manager")).employees.linkHistory()).resolves.toMatchObject([{ employeeName: "إبراهيم", log: { action: "linked" } }]);
    fixture.auditRows.splice(0, fixture.auditRows.length, { id: 71, userId: 1, title: "تم ربط حسابك الوظيفي", body: "تم الربط", readAt: null, createdAt: new Date() });
    await expect(appRouter.createCaller(context("owner")).notifications.mine()).resolves.toMatchObject([{ id: 71, title: "تم ربط حسابك الوظيفي" }]);
    fixture.selectResults.push([{ id: 71, userId: 1, readAt: null }]);
    await expect(appRouter.createCaller(context("owner")).notifications.markRead({ notificationId: 71 })).resolves.toEqual({ success: true });
    expect(fixture.updated).toEqual(expect.arrayContaining([expect.objectContaining({ readAt: expect.any(Date) })]));
  });

  it("يبحث سجل الربط داخل النتائج المصرح بها ويمنع المدير من اختيار فرع خارج نطاقه", async () => {
    fixture.auditRows.splice(0, fixture.auditRows.length,
      { log: { id: 81, employeeId: 7, branchId: 1, action: "linked", source: "owner_direct", actorName: "اختبار", createdAt: new Date() }, employeeName: "إبراهيم", employeeCode: "13", accountName: "سارة", accountEmail: "sara@example.com" },
      { log: { id: 82, employeeId: 7, branchId: 1, action: "unlinked", source: "owner_direct", actorName: "اختبار", createdAt: new Date() }, employeeName: "إبراهيم", employeeCode: "13", accountName: "مروان", accountEmail: "marwan@example.com" },
    );
    await expect(appRouter.createCaller(context("manager")).employees.linkHistory({ search: "سارة", action: "linked", source: "owner_direct" })).resolves.toMatchObject([{ accountName: "سارة", log: { action: "linked" } }]);
    await expect(appRouter.createCaller(context("manager")).employees.linkHistory({ branchId: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("يرسل المدير المسير لاعتماد المدير ثم يحيله لمدير الموارد البشرية مع تسجيل القرار", async () => {
    fixture.updated.length = 0;
    fixture.auditEvents.length = 0;
    fixture.selectResults.push([{ id: 81, branchId: 1, status: "draft", year: 2026, month: 8 }]);
    await expect(appRouter.createCaller(context("manager")).payroll.submitForApproval({ payrollRunId: 81 })).resolves.toEqual({ success: true, status: "pending_manager" });
    expect(fixture.updated[0]).toMatchObject({ status: "pending_manager" });
    fixture.selectResults.push([{ id: 81, branchId: 1, status: "pending_manager", year: 2026, month: 8 }]);
    await expect(appRouter.createCaller(context("manager")).payroll.reviewApproval({ payrollRunId: 81, decision: "approved" })).resolves.toEqual({ success: true, status: "pending_hr" });
    expect(fixture.auditEvents).toEqual(expect.arrayContaining([expect.objectContaining({ payrollRunId: 81, approvalStage: "manager", decision: "approved" })]));
  });

  it("يقصر الاعتماد النهائي على مدير الموارد البشرية أو المالك ويرفض دور الموظف", async () => {
    fixture.updated.length = 0;
    fixture.auditEvents.length = 0;
    fixture.selectResults.push([{ id: 82, branchId: 1, status: "pending_hr", year: 2026, month: 8 }]);
    await expect(appRouter.createCaller(context("hr_manager")).payroll.reviewApproval({ payrollRunId: 82, decision: "approved", note: "تمت المراجعة" })).resolves.toEqual({ success: true, status: "approved" });
    expect(fixture.updated[0]).toMatchObject({ status: "approved" });
    fixture.selectResults.push([{ id: 82, branchId: 1, status: "pending_hr", year: 2026, month: 8 }]);
    await expect(appRouter.createCaller(context("employee")).payroll.reviewApproval({ payrollRunId: 82, decision: "approved" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("يرفض تعديل الموظف من دور غير إداري", async () => {
    await expect(appRouter.createCaller(context("employee")).employees.update({ employeeId: 7, employeeCode: "13", fullName: "إبراهيم المعدل", jobTitle: "مساعد", role: "employee", hireDate: new Date("2026-08-06") })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
