import { describe, expect, it } from "vitest";
import { parseAttendanceRows } from "./attendance-import";

describe("attendance import parser", () => {
  it("maps Arabic headers and parses a valid attendance row", () => {
    const draft = parseAttendanceRows("حضور.xlsx", "xlsx", [
      ["كود الموظف", "تاريخ العمل", "وقت الحضور", "وقت الانصراف", "الحالة"],
      ["EMP-001", "01/08/2026", "09:00", "17:00", "حاضر"],
    ]);

    expect(draft.issues).toEqual([]);
    expect(draft.rows).toHaveLength(1);
    expect(draft.rows[0]).toMatchObject({ employeeCode: "EMP-001", status: "present", issues: [] });
    expect(draft.rows[0]?.workDate?.toISOString().slice(0, 10)).toBe("2026-08-01");
    expect(draft.rows[0]?.checkInAt?.getHours()).toBe(9);
    expect(draft.rows[0]?.checkOutAt?.getHours()).toBe(17);
  });

  it("flags incomplete and invalid punch times before any server import", () => {
    const draft = parseAttendanceRows("attendance.csv", "csv", [
      ["employee code", "date", "check in", "check out"],
      ["EMP-002", "2026-08-03", "10:00", ""],
      ["EMP-003", "2026-08-03", "18:00", "17:00"],
    ]);

    expect(draft.rows[0]?.issues).toContain("missing_time_pair");
    expect(draft.rows[1]?.issues).toContain("invalid_time_order");
  });

  it("requires the employee code and work-date columns", () => {
    const draft = parseAttendanceRows("bad.xlsx", "xlsx", [["الاسم", "وقت الحضور"], ["أحمد", "09:00"]]);
    expect(draft.issues).toEqual(expect.arrayContaining(["لم يتم العثور على عمود كود الموظف.", "لم يتم العثور على عمود تاريخ العمل."]));
  });
});
