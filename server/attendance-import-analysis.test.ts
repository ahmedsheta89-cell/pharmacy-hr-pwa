import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const fixture = vi.hoisted(() => {
  const inserts: Array<{ table: unknown; values: unknown; update?: unknown }> = [];
  const deleted: unknown[] = [];
  const employee = { id: 7, userId: null, branchId: 1, employeeCode: "13", fullName: "منى", employmentStatus: "active" };
  const selectResults: unknown[][] = [[employee], [], []];
  const db = {
    select: () => ({ from: () => {
      const queryResult = () => {
        const resolveRows = () => Promise.resolve(selectResults.shift() ?? []);
        return { orderBy: resolveRows, limit: resolveRows, then: (resolve: (value: unknown[]) => unknown) => resolveRows().then(resolve) };
      };
      const joined = { innerJoin: () => joined, leftJoin: () => joined, where: queryResult, orderBy: () => queryResult() };
      return { where: queryResult, innerJoin: () => joined, leftJoin: () => joined, orderBy: () => queryResult() };
    } }),
    insert: (table: unknown) => ({ values: (values: unknown) => {
      const event = { table, values, update: undefined as unknown };
      inserts.push(event);
      return { onDuplicateKeyUpdate: async ({ set }: { set: unknown }) => { event.update = set; }, then: (resolve: (value: Array<{ insertId: number }>) => unknown) => Promise.resolve([{ insertId: 91 }]).then(resolve) };
    } }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
    delete: (table: unknown) => ({ where: async () => { deleted.push(table); } }),
  };
  return { inserts, deleted, selectResults, db, employee };
});

vi.mock("./db", () => ({ getDb: async () => fixture.db, getEmployeeByUserId: async () => fixture.employee }));

import { attendanceImportExceptions, attendanceImportRows, attendancePolicies, attendanceRecords, payrollAdjustments } from "../drizzle/schema";
import { appRouter } from "./routers";

function context(role: "owner" | "manager" | "employee" = "owner"): TrpcContext {
  return { user: { id: 1, openId: `test-${role}`, name: "اختبار", email: "test@example.com", loginMethod: "test", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: () => undefined } as TrpcContext["res"] };
}

describe("attendance.importRecords analysis contract", () => {
  it("persists a night-shift schedule snapshot and an approved operational exception without creating a payroll adjustment", async () => {
    fixture.inserts.length = 0;
    fixture.selectResults.splice(0, fixture.selectResults.length, [fixture.employee], [], []);

    const result = await appRouter.createCaller(context()).attendance.importRecords({
      branchId: 1,
      sourceFileName: "حضور-يوليو.xlsx",
      sourceFormat: "xlsx",
      replaceExisting: false,
      confirmApply: true,
      rows: [{ employeeCode: "13", workDate: new Date("2026-07-01T00:00:00"), checkInAt: new Date("2026-07-01T21:00:00"), checkOutAt: new Date("2026-07-01T05:00:00"), status: "present", calculation: { treatment: "approved_alternative", schedule: { shiftStart: "20:00", shiftEnd: "04:00", breakMinutes: 30, graceMinutes: 15 }, note: "وردية بديلة معتمدة" } }],
    });

    expect(result).toMatchObject({ success: true, applied: 1, skipped: 0 });
    const record = fixture.inserts.find(event => event.table === attendanceRecords)?.values as Record<string, unknown>;
    expect(record).toMatchObject({ employeeId: 7, scheduledMinutes: 450, workedMinutes: 450, lateMinutes: 45, earlyLeaveMinutes: 0, overtimeMinutes: 60, analysisTreatment: "approved_alternative", analysisSchedule: { shiftStart: "20:00", shiftEnd: "04:00", breakMinutes: 30, graceMinutes: 15 } });
    expect((record.checkOutAt as Date).getDate()).toBe(2);
    const exception = fixture.inserts.find(event => event.table === attendanceImportExceptions)?.values as Record<string, unknown>;
    expect(exception).toMatchObject({ employeeId: 7, treatment: "approved_alternative", operationalStatus: "resolved", decisionNote: "وردية بديلة معتمدة" });
    expect(fixture.inserts.find(event => event.table === attendanceImportRows)).toBeTruthy();
    expect(fixture.inserts.find(event => event.table === payrollAdjustments)).toBeFalsy();
  });

  it("prevents employee accounts from persisting an import exception or attendance-analysis decision", async () => {
    await expect(appRouter.createCaller(context("employee")).attendance.importRecords({
      branchId: 1,
      sourceFileName: "حضور.xlsx",
      sourceFormat: "xlsx",
      replaceExisting: false,
      confirmApply: true,
      rows: [{ employeeCode: "13", workDate: new Date("2026-07-01T00:00:00"), checkInAt: new Date("2026-07-01T09:00:00"), checkOutAt: new Date("2026-07-01T17:00:00"), calculation: { treatment: "scheduled", schedule: { shiftStart: "09:00", shiftEnd: "17:00", breakMinutes: 0, graceMinutes: 15 } } }],
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("saves only the analytical policy fields for the selected branch and enforces manager branch scope", async () => {
    fixture.inserts.length = 0;
    await expect(appRouter.createCaller(context("manager")).policies.saveImportAnalysis({ branchId: 2, shiftStart: "09:00", shiftEnd: "17:00", breakMinutes: 30, graceMinutes: 15, targetScore: 90 })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(appRouter.createCaller(context()).policies.saveImportAnalysis({ branchId: 2, shiftStart: "20:00", shiftEnd: "04:00", breakMinutes: 30, graceMinutes: 15, targetScore: 92 })).resolves.toEqual({ success: true });
    expect(fixture.inserts.find(event => event.table === attendancePolicies)?.values).toMatchObject({ branchId: 2, analysisShiftStart: "20:00:00", analysisShiftEnd: "04:00:00", analysisBreakMinutes: 30, graceMinutes: 15, analysisTargetScore: 92 });
  });

  it("removes a previous exception when the manager explicitly restores the base schedule", async () => {
    fixture.inserts.length = 0;
    fixture.deleted.length = 0;
    fixture.selectResults.splice(0, fixture.selectResults.length, [fixture.employee], [], []);
    await appRouter.createCaller(context()).attendance.importRecords({
      branchId: 1,
      sourceFileName: "حضور.xlsx",
      sourceFormat: "xlsx",
      replaceExisting: false,
      confirmApply: true,
      rows: [{ employeeCode: "13", workDate: new Date("2026-07-02T00:00:00"), checkInAt: new Date("2026-07-02T09:00:00"), checkOutAt: new Date("2026-07-02T17:00:00"), calculation: { treatment: "scheduled", schedule: { shiftStart: "09:00", shiftEnd: "17:00", breakMinutes: 0, graceMinutes: 15 } } }],
    });
    expect(fixture.deleted).toEqual([attendanceImportExceptions]);
  });

  it("returns historical exceptions only inside the authorised branch and honours search and status filters", async () => {
    const resolvedException = { id: 71, branchId: 1, employeeId: 7, treatment: "approved_normal", operationalStatus: "resolved", workDate: new Date("2026-07-04T00:00:00Z"), decisionNote: "استئذان معتمد", decidedAt: new Date("2026-07-04T09:00:00Z") };
    fixture.selectResults.splice(0, fixture.selectResults.length, [{ employeeCode: "13", employeeName: "منى", exception: resolvedException, actorName: "المدير", actorEmail: null }, { employeeCode: "14", employeeName: "سارة", exception: { ...resolvedException, id: 72, operationalStatus: "pending_review", decisionNote: "إضافي" }, actorName: "المدير", actorEmail: null }]);

    await expect(appRouter.createCaller(context("manager")).attendance.importExceptions({ branchId: 2, from: new Date("2026-07-01"), to: new Date("2026-07-31") })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(context()).attendance.importExceptions({ branchId: 1, from: new Date("2026-07-01"), to: new Date("2026-07-31"), search: "منى", treatment: "approved_normal", operationalStatus: "resolved" })).resolves.toEqual([expect.objectContaining({ employeeCode: "13", employeeName: "منى", exception: expect.objectContaining({ operationalStatus: "resolved" }) })]);
  });
});
