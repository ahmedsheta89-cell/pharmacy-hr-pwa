import { describe, expect, it } from "vitest";
import { analyzeAttendanceImport, expectedShiftMinutes } from "./attendance-import-analysis";
import type { AttendanceImportDraft } from "./attendance-import";

const settings = { shiftStart: "09:00", shiftEnd: "17:00", breakMinutes: 0, graceMinutes: 15, targetScore: 90 };

describe("attendance import analysis", () => {
  it("summarizes uploaded rows by employee using the stated shift settings", () => {
    const draft: AttendanceImportDraft = {
      sourceFileName: "حضور.xlsx", sourceFormat: "xlsx", headers: [], issues: [], detectedLayout: "standard", rows: [
        { rowNumber: 2, employeeCode: "EMP-01", workDate: new Date("2026-07-01"), checkInAt: new Date("2026-07-01T09:00:00"), checkOutAt: new Date("2026-07-01T17:00:00"), status: "present", issues: [] },
        { rowNumber: 3, employeeCode: "EMP-01", workDate: new Date("2026-07-02"), checkInAt: new Date("2026-07-02T09:30:00"), checkOutAt: new Date("2026-07-02T16:45:00"), status: "present", issues: [] },
        { rowNumber: 4, employeeCode: "EMP-02", workDate: new Date("2026-07-01"), status: "absent", issues: [] },
      ],
    };

    const analysis = analyzeAttendanceImport(draft, settings);

    expect(analysis).toMatchObject({ expectedShiftMinutes: 480, totalRows: 3, employeeCount: 2, reviewRows: 1 });
    expect(analysis.employees).toEqual(expect.arrayContaining([
      expect.objectContaining({ employeeCode: "EMP-01", importedRows: 2, completeShifts: 2, lateMinutes: 15, earlyLeaveMinutes: 15, workedMinutes: 915 }),
      expect.objectContaining({ employeeCode: "EMP-02", absentRows: 1, completeShifts: 0, score: 0 }),
    ]));
  });

  it("flags an equal start and end schedule for review instead of producing financial actions", () => {
    const draft: AttendanceImportDraft = { sourceFileName: "حضور.xlsx", sourceFormat: "xlsx", headers: [], issues: [], detectedLayout: "standard", rows: [{ rowNumber: 2, employeeCode: "EMP-01", workDate: new Date("2026-07-01"), checkInAt: new Date("2026-07-01T09:00:00"), checkOutAt: new Date("2026-07-01T17:00:00"), status: "present", issues: [] }] };

    const analysis = analyzeAttendanceImport(draft, { ...settings, shiftStart: "09:00", shiftEnd: "09:00" });

    expect(expectedShiftMinutes({ shiftStart: "09:00", shiftEnd: "09:00" })).toBe(0);
    expect(analysis).toMatchObject({ expectedShiftMinutes: 0, reviewRows: 1 });
    expect(analysis.assessments[0]).toMatchObject({ status: "not_analyzable" });
  });

  it("uses a per-employee overnight schedule and an approved exception as the stated calculation basis", () => {
    const draft: AttendanceImportDraft = { sourceFileName: "حضور.xlsx", sourceFormat: "xlsx", headers: [], issues: [], detectedLayout: "standard", rows: [
      { rowNumber: 2, employeeCode: "EMP-NIGHT", workDate: new Date("2026-07-01"), checkInAt: new Date("2026-07-01T20:00:00"), checkOutAt: new Date("2026-07-01T04:00:00"), status: "present", issues: [] },
      { rowNumber: 3, employeeCode: "EMP-02", workDate: new Date("2026-07-02"), checkInAt: new Date("2026-07-02T12:00:00"), checkOutAt: new Date("2026-07-02T14:00:00"), status: "present", issues: [] },
    ] };

    const analysis = analyzeAttendanceImport(draft, { ...settings, employeeSchedules: { "EMP-NIGHT": { shiftStart: "20:00", shiftEnd: "04:00", breakMinutes: 30, graceMinutes: 10 } }, exceptions: { 3: { treatment: "approved_normal", note: "استئذان معتمد" } } });

    expect(expectedShiftMinutes({ shiftStart: "20:00", shiftEnd: "04:00", breakMinutes: 30 })).toBe(450);
    expect(analysis.assessments).toEqual(expect.arrayContaining([
      expect.objectContaining({ employeeCode: "EMP-NIGHT", status: "on_time", scheduledMinutes: 450, workedMinutes: 450 }),
      expect.objectContaining({ employeeCode: "EMP-02", treatment: "approved_normal", status: "on_time", workedMinutes: 480 }),
    ]));
  });

  it("keeps overtime, hourly, shortfall, and exclusion treatments explicit and operational only", () => {
    const draft: AttendanceImportDraft = { sourceFileName: "استثناءات.xlsx", sourceFormat: "xlsx", headers: [], issues: [], detectedLayout: "standard", rows: [
      { rowNumber: 2, employeeCode: "EMP-ALT", workDate: new Date("2026-07-03"), checkInAt: new Date("2026-07-03T10:00:00"), checkOutAt: new Date("2026-07-03T18:00:00"), status: "present", issues: [] },
      { rowNumber: 3, employeeCode: "EMP-OT", workDate: new Date("2026-07-03"), checkInAt: new Date("2026-07-03T09:00:00"), checkOutAt: new Date("2026-07-03T19:00:00"), status: "present", issues: [] },
      { rowNumber: 4, employeeCode: "EMP-HOUR", workDate: new Date("2026-07-03"), checkInAt: new Date("2026-07-03T11:00:00"), checkOutAt: new Date("2026-07-03T13:00:00"), status: "present", issues: [] },
      { rowNumber: 5, employeeCode: "EMP-SHORT", workDate: new Date("2026-07-03"), checkInAt: new Date("2026-07-03T09:00:00"), checkOutAt: new Date("2026-07-03T16:00:00"), status: "present", issues: [] },
      { rowNumber: 6, employeeCode: "EMP-EXCLUDE", workDate: new Date("2026-07-03"), checkInAt: new Date("2026-07-03T09:00:00"), checkOutAt: new Date("2026-07-03T17:00:00"), status: "present", issues: [] },
    ] };

    const analysis = analyzeAttendanceImport(draft, { ...settings, exceptions: {
      2: { treatment: "approved_alternative", alternativeShiftStart: "10:00", alternativeShiftEnd: "18:00", note: "تبديل معتمد" },
      3: { treatment: "overtime_review", note: "إضافي للمراجعة" },
      4: { treatment: "hourly_review", note: "مراجعة بالساعة" },
      5: { treatment: "unapproved_shortfall", note: "عجز للمراجعة" },
      6: { treatment: "exclude_from_analysis", note: "مستبعد بقرار تشغيلي" },
    } });

    expect(analysis.assessments).toEqual(expect.arrayContaining([
      expect.objectContaining({ employeeCode: "EMP-ALT", treatment: "approved_alternative", status: "on_time", scheduledMinutes: 480, lateMinutes: 0 }),
      expect.objectContaining({ employeeCode: "EMP-OT", treatment: "overtime_review", status: "needs_review", overtimeMinutes: 120 }),
      expect.objectContaining({ employeeCode: "EMP-HOUR", treatment: "hourly_review", status: "needs_review", scheduledMinutes: 0, workedMinutes: 120, lateMinutes: 0, overtimeMinutes: 0 }),
      expect.objectContaining({ employeeCode: "EMP-SHORT", treatment: "unapproved_shortfall", status: "needs_review", earlyLeaveMinutes: 60 }),
      expect.objectContaining({ employeeCode: "EMP-EXCLUDE", treatment: "exclude_from_analysis", status: "excluded", scheduledMinutes: 0 }),
    ]));
  });
});
