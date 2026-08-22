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
    employees: employeeRows,
    linkedEmployee: { id: 2, branchId: 1 },
    db: {
      select: () => ({ from: () => {
        const joined = { innerJoin: () => joined, where: () => query(), orderBy: () => ({ then: (resolve: (value: typeof auditRows) => unknown) => Promise.resolve(auditRows).then(resolve) }) };
        return { where: () => query(), innerJoin: () => joined };
      } }),
      update: () => ({ set: (values: Record<string, unknown>) => ({ where: async () => { updated.push(values); } }) }),
      insert: () => ({ values: async (values: Record<string, unknown>) => { auditEvents.push(values); return [{ insertId: 44 }]; } }),
    },
  };
});

vi.mock("./db", () => ({ getDb: async () => fixture.db, getEmployeeByUserId: async () => fixture.linkedEmployee }));

import { appRouter } from "./routers";

function context(role: "owner" | "manager" | "employee"): TrpcContext {
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
    fixture.auditRows.splice(0, fixture.auditRows.length, { log: { id: 61, employeeId: 7, branchId: 1, action: "linked", actorName: "اختبار", createdAt: new Date() }, employeeName: "إبراهيم", employeeCode: "13" });
    await expect(appRouter.createCaller(context("manager")).employees.linkHistory()).resolves.toMatchObject([{ employeeName: "إبراهيم", log: { action: "linked" } }]);
    fixture.auditRows.splice(0, fixture.auditRows.length, { id: 71, userId: 1, title: "تم ربط حسابك الوظيفي", body: "تم الربط", readAt: null, createdAt: new Date() });
    await expect(appRouter.createCaller(context("owner")).notifications.mine()).resolves.toMatchObject([{ id: 71, title: "تم ربط حسابك الوظيفي" }]);
    fixture.selectResults.push([{ id: 71, userId: 1, readAt: null }]);
    await expect(appRouter.createCaller(context("owner")).notifications.markRead({ notificationId: 71 })).resolves.toEqual({ success: true });
    expect(fixture.updated).toEqual(expect.arrayContaining([expect.objectContaining({ readAt: expect.any(Date) })]));
  });

  it("يرفض تعديل الموظف من دور غير إداري", async () => {
    await expect(appRouter.createCaller(context("employee")).employees.update({ employeeId: 7, employeeCode: "13", fullName: "إبراهيم المعدل", jobTitle: "مساعد", role: "employee", hireDate: new Date("2026-08-06") })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
