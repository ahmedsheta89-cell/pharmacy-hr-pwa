import { downloadExcelWorkbook } from "./excel-export";
import type { AttendanceImportAnalysis, AttendanceImportAnalysisSettings } from "./attendance-import-analysis";
import type { AttendanceImportDraft } from "./attendance-import";

const treatmentLabels: Record<string, string> = { scheduled: "وفق الوردية الأساسية", approved_normal: "استئذان معتمد — يوم عادي", approved_alternative: "وردية بديلة معتمدة", overtime_review: "وقت إضافي للمراجعة", hourly_review: "ساعة بساعة للمراجعة", unapproved_shortfall: "عجز غير معتمد للمراجعة", exclude_from_analysis: "مستبعد من التحليل" };
function normalizedCode(value: string) { return value.trim().toUpperCase(); }

export function exportAttendanceImportAnalysisExcel(draft: AttendanceImportDraft, settings: AttendanceImportAnalysisSettings, analysis: AttendanceImportAnalysis) {
  const headers = ["الموظف", "الوردية الأساسية", "السجلات", "شيفتات مكتملة", "للمراجعة", "غياب", "بعذر", "دقائق العمل", "التأخير", "انصراف مبكر", "إضافي", "درجة الالتزام", "النتيجة", "استثناءات مسجلة"];
  const rows = analysis.employees.map(employee => {
    const schedule = settings.employeeSchedules?.[normalizedCode(employee.employeeCode)] ?? { shiftStart: settings.shiftStart, shiftEnd: settings.shiftEnd, breakMinutes: settings.breakMinutes, graceMinutes: settings.graceMinutes };
    const exceptions = draft.rows.filter(row => normalizedCode(row.employeeCode) === normalizedCode(employee.employeeCode)).map(row => settings.exceptions?.[row.rowNumber]).filter((value): value is NonNullable<typeof value> => Boolean(value && value.treatment !== "scheduled")).map(exception => `${treatmentLabels[exception.treatment]}${exception.note ? `: ${exception.note}` : ""}`).join(" | ") || "—";
    return [employee.employeeCode, `${schedule.shiftStart}–${schedule.shiftEnd} · استراحة ${schedule.breakMinutes} د · سماحية ${schedule.graceMinutes} د`, employee.importedRows, employee.completeShifts, employee.reviewRows, employee.absentRows, employee.excusedRows, employee.workedMinutes, employee.lateMinutes, employee.earlyLeaveMinutes, employee.overtimeMinutes, `${employee.score.toFixed(1)}%`, employee.meetsTarget ? "ضمن الحد" : "دون الحد", exceptions];
  });
  const safeName = draft.sourceFileName.replace(/\.[^.]+$/, "").slice(0, 80) || "تحليل-الحضور";
  downloadExcelWorkbook(`${safeName}-تقرير-تحليل`, headers, rows, "تحليل الحضور");
  return { filename: `${safeName}-تقرير-تحليل.xlsx`, settings, totalRows: analysis.totalRows };
}

export async function exportAttendanceImportAnalysisPdf(element: HTMLElement, draft: AttendanceImportDraft) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const canvas = await html2canvas(element, { scale: 1.5, backgroundColor: "#f8fcfa", useCORS: true, logging: false });
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4", compress: true });
  const margin = 24;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const renderedWidth = pageWidth - (margin * 2);
  const renderedHeight = (canvas.height * renderedWidth) / canvas.width;
  const image = canvas.toDataURL("image/png");
  let pageOffset = 0;
  while (pageOffset * (pageHeight - (margin * 2)) < renderedHeight) {
    if (pageOffset > 0) pdf.addPage();
    pdf.addImage(image, "PNG", margin, margin - (pageOffset * (pageHeight - (margin * 2))), renderedWidth, renderedHeight, undefined, "FAST");
    pageOffset += 1;
  }
  const safeName = draft.sourceFileName.replace(/\.[^.]+$/, "").slice(0, 80) || "تحليل-الحضور";
  pdf.save(`${safeName}-تقرير-تحليل.pdf`);
  return { filename: `${safeName}-تقرير-تحليل.pdf` };
}
