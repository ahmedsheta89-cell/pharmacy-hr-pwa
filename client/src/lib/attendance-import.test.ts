import { describe, expect, it } from "vitest";
import { describeAttendanceImportFile, getAttendanceImportRowEdit, getAttendanceImportSelectionMessage, parseAttendanceRows, reviseAttendanceImportRow, validateAttendanceImportFile } from "./attendance-import";

function fileMetadata(name: string, size: number): Pick<File, "name" | "size"> {
  return { name, size };
}

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

  it("flags incomplete punch pairs while preserving potential overnight shifts for later shift-aware analysis", () => {
    const draft = parseAttendanceRows("attendance.csv", "csv", [
      ["employee code", "date", "check in", "check out"],
      ["EMP-002", "2026-08-03", "10:00", ""],
      ["EMP-003", "2026-08-03", "18:00", "17:00"],
    ]);

    expect(draft.rows[0]?.issues).toContain("missing_time_pair");
    expect(draft.rows[1]?.issues).toEqual([]);
    expect(draft.rows[1]?.checkInAt?.getHours()).toBe(18);
    expect(draft.rows[1]?.checkOutAt?.getHours()).toBe(17);
  });

  it("requires the employee code and work-date columns", () => {
    const draft = parseAttendanceRows("bad.xlsx", "xlsx", [["الاسم", "وقت الحضور"], ["أحمد", "09:00"]]);
    expect(draft.issues).toEqual(expect.arrayContaining(["لم يتم العثور على عمود كود الموظف.", "لم يتم العثور على عمود تاريخ العمل."]));
  });

  it("parses grouped fingerprint-device exports with employee headers repeated through the sheet", () => {
    const draft = parseAttendanceRows("حضوروانصرافشهر7.xlsx", "xlsx", [
      ["صيدلي", "الوظيفة", "", "البطاقة", "SARA", "الإسم", 13, "الكود", "تأخير/زيادة", "ساعات العمل", "الانصراف", "الحضور"],
      ["", "-2:07", "5:52", "", "", new Date("2026-07-01T18:06:55"), new Date("2026-07-01T12:14:21"), 352],
      ["", "", "", "", "", "", new Date("2026-07-08T11:44:55")],
      ["مساعد", "الوظيفة", "", "البطاقة", "د/ ريهام", "الإسم", 20, "الكود", "تأخير/زيادة", "ساعات العمل", "الانصراف", "الحضور"],
      ["", "-1:52", "6:08", "", "", new Date("2026-07-03T18:34:56"), new Date("2026-07-03T12:26:56"), 368],
    ]);

    expect(draft.detectedLayout).toBe("device_report");
    expect(draft.rows).toHaveLength(3);
    expect(draft.rows[0]).toMatchObject({ rowNumber: 2, employeeCode: "13", issues: [] });
    expect(draft.rows[0]?.workDate?.toISOString().slice(0, 10)).toBe("2026-07-01");
    expect(draft.rows[1]).toMatchObject({ rowNumber: 3, employeeCode: "13", issues: ["missing_time_pair"] });
    expect(draft.rows[2]).toMatchObject({ rowNumber: 5, employeeCode: "20", issues: [] });
  });

  it("revalidates a corrected preview row immediately before any server approval", () => {
    const draft = parseAttendanceRows("attendance.xlsx", "xlsx", [
      ["كود الموظف", "تاريخ العمل", "وقت الحضور", "وقت الانصراف"],
      ["13", "2026-07-08", "11:44", ""],
    ]);
    const invalidRow = draft.rows[0]!;

    const corrected = reviseAttendanceImportRow(invalidRow, { ...getAttendanceImportRowEdit(invalidRow), checkOutTime: "18:00" });

    expect(invalidRow.issues).toEqual(["missing_time_pair"]);
    expect(corrected).toMatchObject({ employeeCode: "13", status: "present", issues: [] });
    expect(corrected.checkOutAt?.getHours()).toBe(18);
  });

  it("confirms the selected file name and size before parsing begins", () => {
    expect(describeAttendanceImportFile(fileMetadata("حضور-أغسطس.xlsx", 1536))).toEqual({
      name: "حضور-أغسطس.xlsx",
      sizeBytes: 1536,
      sizeLabel: "2 كيلوبايت",
    });
    expect(getAttendanceImportSelectionMessage(fileMetadata("حضور-أغسطس.xlsx", 1536))).toBe("تم اختيار «حضور-أغسطس.xlsx» بحجم 2 كيلوبايت. جارٍ تجهيز المعاينة.");
  });

  it("accepts modern Excel and CSV files regardless of extension case", () => {
    expect(validateAttendanceImportFile(fileMetadata("attendance.XLSX", 1024))).toBe("xlsx");
    expect(validateAttendanceImportFile(fileMetadata("attendance.CsV", 1024))).toBe("csv");
  });

  it("explains how to recover from a legacy Excel file or oversized upload", () => {
    expect(() => validateAttendanceImportFile(fileMetadata("attendance.xls", 1024))).toThrow("حوّل ملف ‎.xls‎ القديم إلى ‎.xlsx‎");
    expect(() => validateAttendanceImportFile(fileMetadata("attendance.xlsx", 5 * 1024 * 1024 + 1))).toThrow("5 ميجابايت");
  });
});
