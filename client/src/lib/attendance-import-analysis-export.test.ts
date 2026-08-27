// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({ downloadExcelWorkbook: vi.fn(), pdfSave: vi.fn(), pdfAddImage: vi.fn(), pdfAddPage: vi.fn(), canvas: { width: 1000, height: 500, toDataURL: vi.fn(() => "data:image/png;base64,report") } }));
vi.mock("./excel-export", () => ({ downloadExcelWorkbook: testState.downloadExcelWorkbook }));
vi.mock("html2canvas", () => ({ default: vi.fn(async () => testState.canvas) }));
vi.mock("jspdf", () => ({ jsPDF: class { internal = { pageSize: { getWidth: () => 842, getHeight: () => 595 } }; addImage = testState.pdfAddImage; addPage = testState.pdfAddPage; save = testState.pdfSave; } }));

import { exportAttendanceImportAnalysisExcel, exportAttendanceImportAnalysisPdf } from "./attendance-import-analysis-export";

describe("attendance import analysis export", () => {
  it("exports the administrative employee assessment fields to an Excel report", () => {
    const result = exportAttendanceImportAnalysisExcel(
      { sourceFileName: "حضور يوليو.xlsx", sourceFormat: "xlsx", headers: [], issues: [], detectedLayout: "standard", rows: [{ rowNumber: 2, employeeCode: "EMP-01", workDate: new Date("2026-07-01"), status: "present", issues: [] }] },
      { shiftStart: "09:00", shiftEnd: "17:00", breakMinutes: 0, graceMinutes: 15, targetScore: 90, exceptions: { 2: { treatment: "approved_alternative", alternativeShiftStart: "10:00", alternativeShiftEnd: "18:00", note: "وردية بديلة معتمدة" } } },
      { expectedShiftMinutes: 480, totalRows: 2, validRows: 2, reviewRows: 0, employeeCount: 1, assessments: [], employees: [{ employeeCode: "EMP-01", importedRows: 2, completeShifts: 2, reviewRows: 0, absentRows: 0, excusedRows: 0, workedMinutes: 960, lateMinutes: 5, earlyLeaveMinutes: 0, overtimeMinutes: 0, score: 98.5, meetsTarget: true }] },
    );

    expect(testState.downloadExcelWorkbook).toHaveBeenCalledWith("حضور يوليو-تقرير-تحليل", expect.arrayContaining(["الموظف", "التأخير", "درجة الالتزام", "استثناءات مسجلة"]), expect.arrayContaining([expect.arrayContaining(["EMP-01", "98.5%", "ضمن الحد", expect.stringContaining("وردية بديلة معتمدة")])]), "تحليل الحضور");
    expect(result.filename).toBe("حضور يوليو-تقرير-تحليل.xlsx");
  });

  it("renders the report into a PDF image so Arabic UI content is preserved as displayed", async () => {
    const result = await exportAttendanceImportAnalysisPdf(document.createElement("section"), { sourceFileName: "حضور يوليو.xlsx", sourceFormat: "xlsx", headers: [], issues: [], detectedLayout: "standard", rows: [] });

    expect(testState.pdfAddImage).toHaveBeenCalledWith("data:image/png;base64,report", "PNG", 24, 24, 794, 397, undefined, "FAST");
    expect(testState.pdfSave).toHaveBeenCalledWith("حضور يوليو-تقرير-تحليل.pdf");
    expect(result.filename).toBe("حضور يوليو-تقرير-تحليل.pdf");
  });
});
