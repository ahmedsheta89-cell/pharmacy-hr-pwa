import { describe, expect, it } from "vitest";
import { analyzeAttendanceImport, expectedShiftMinutes } from "./attendance-import-analysis";
import type { AttendanceImportDraft } from "./attendance-import";

const settings = { shiftStart: "09:00", shiftEnd: "17:00", graceMinutes: 15, targetScore: 90 };

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

  it("flags an impossible shift schedule for review instead of producing financial actions", () => {
    const draft: AttendanceImportDraft = { sourceFileName: "حضور.xlsx", sourceFormat: "xlsx", headers: [], issues: [], detectedLayout: "standard", rows: [{ rowNumber: 2, employeeCode: "EMP-01", workDate: new Date("2026-07-01"), checkInAt: new Date("2026-07-01T09:00:00"), checkOutAt: new Date("2026-07-01T17:00:00"), status: "present", issues: [] }] };

    const analysis = analyzeAttendanceImport(draft, { ...settings, shiftStart: "17:00", shiftEnd: "09:00" });

    expect(expectedShiftMinutes({ shiftStart: "17:00", shiftEnd: "09:00" })).toBe(0);
    expect(analysis).toMatchObject({ expectedShiftMinutes: 0, reviewRows: 1 });
    expect(analysis.assessments[0]).toMatchObject({ status: "not_analyzable" });
  });
});
