import type { AttendanceImportDraft, AttendanceImportDraftRow } from "./attendance-import";

export type AttendanceImportAnalysisSettings = {
  shiftStart: string;
  shiftEnd: string;
  graceMinutes: number;
  targetScore: number;
};

export type AttendanceRecordAssessment = {
  rowNumber: number;
  employeeCode: string;
  status: "on_time" | "needs_review" | "not_analyzable" | "absent" | "excused";
  workedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  reasons: string[];
};

export type EmployeeAttendanceAssessment = {
  employeeCode: string;
  importedRows: number;
  completeShifts: number;
  reviewRows: number;
  absentRows: number;
  excusedRows: number;
  workedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  score: number;
  meetsTarget: boolean;
};

export type AttendanceImportAnalysis = {
  expectedShiftMinutes: number;
  totalRows: number;
  validRows: number;
  reviewRows: number;
  employeeCount: number;
  assessments: AttendanceRecordAssessment[];
  employees: EmployeeAttendanceAssessment[];
};

export const defaultAttendanceImportAnalysisSettings: AttendanceImportAnalysisSettings = {
  shiftStart: "09:00",
  shiftEnd: "17:00",
  graceMinutes: 15,
  targetScore: 90,
};

function toMinutes(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return 0;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 ? (hours * 60) + minutes : 0;
}

function timeOfDay(value?: Date) {
  return value ? (value.getHours() * 60) + value.getMinutes() : undefined;
}

function clampPercent(value: number) {
  return Math.round(Math.min(100, Math.max(0, value)) * 100) / 100;
}

export function expectedShiftMinutes(settings: Pick<AttendanceImportAnalysisSettings, "shiftStart" | "shiftEnd">) {
  const start = toMinutes(settings.shiftStart);
  const end = toMinutes(settings.shiftEnd);
  return end > start ? end - start : 0;
}

export function analyzeAttendanceImport(draft: AttendanceImportDraft, rawSettings: AttendanceImportAnalysisSettings): AttendanceImportAnalysis {
  const settings = {
    ...rawSettings,
    graceMinutes: Math.max(0, Math.min(240, Number(rawSettings.graceMinutes) || 0)),
    targetScore: clampPercent(Number(rawSettings.targetScore) || 0),
  };
  const scheduledStart = toMinutes(settings.shiftStart);
  const scheduledEnd = toMinutes(settings.shiftEnd);
  const expectedMinutes = expectedShiftMinutes(settings);
  const assessments = draft.rows.map(row => assessRow(row, scheduledStart, scheduledEnd, expectedMinutes, settings.graceMinutes));
  const byEmployee = new Map<string, AttendanceRecordAssessment[]>();
  assessments.forEach(assessment => {
    const key = assessment.employeeCode || "بدون كود";
    byEmployee.set(key, [...(byEmployee.get(key) ?? []), assessment]);
  });
  const employees = Array.from(byEmployee.entries()).map(([employeeCode, records]) => summarizeEmployee(employeeCode, records, expectedMinutes, settings.targetScore)).sort((left, right) => left.employeeCode.localeCompare(right.employeeCode, "en"));
  const reviewRows = assessments.filter(assessment => assessment.status === "needs_review" || assessment.status === "not_analyzable").length;

  return { expectedShiftMinutes: expectedMinutes, totalRows: draft.rows.length, validRows: draft.rows.length - reviewRows, reviewRows, employeeCount: employees.length, assessments, employees };
}

function assessRow(row: AttendanceImportDraftRow, scheduledStart: number, scheduledEnd: number, expectedMinutes: number, graceMinutes: number): AttendanceRecordAssessment {
  const base = { rowNumber: row.rowNumber, employeeCode: row.employeeCode, workedMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0 };
  if (row.issues.length || !expectedMinutes) return { ...base, status: "not_analyzable", reasons: row.issues.length ? row.issues : ["راجع أوقات الوردية؛ وقت النهاية يجب أن يكون بعد البداية"] };
  if (row.status === "absent") return { ...base, status: "absent", reasons: ["غياب مسجل في الملف"] };
  if (row.status === "excused") return { ...base, status: "excused", reasons: ["حالة بعذر مسجلة في الملف"] };
  const checkIn = timeOfDay(row.checkInAt);
  const checkOut = timeOfDay(row.checkOutAt);
  if (checkIn === undefined || checkOut === undefined || checkOut <= checkIn) return { ...base, status: "not_analyzable", reasons: ["وقت الحضور والانصراف غير صالح للتحليل"] };
  const workedMinutes = checkOut - checkIn;
  const lateMinutes = Math.max(0, checkIn - scheduledStart - graceMinutes);
  const earlyLeaveMinutes = Math.max(0, scheduledEnd - checkOut);
  const overtimeMinutes = Math.max(0, checkOut - scheduledEnd);
  const reasons = [lateMinutes ? `تأخر ${lateMinutes} د` : "", earlyLeaveMinutes ? `انصراف مبكر ${earlyLeaveMinutes} د` : ""].filter(Boolean);
  return { ...base, status: reasons.length ? "needs_review" : "on_time", workedMinutes, lateMinutes, earlyLeaveMinutes, overtimeMinutes, reasons: reasons.length ? reasons : ["مطابق لإطار الوردية المحدد"] };
}

function summarizeEmployee(employeeCode: string, records: AttendanceRecordAssessment[], expectedMinutes: number, targetScore: number): EmployeeAttendanceAssessment {
  const completeRecords = records.filter(record => record.status === "on_time" || record.status === "needs_review");
  const importedRows = records.length;
  const completeShifts = completeRecords.length;
  const reviewRows = records.filter(record => record.status === "needs_review" || record.status === "not_analyzable").length;
  const absentRows = records.filter(record => record.status === "absent").length;
  const excusedRows = records.filter(record => record.status === "excused").length;
  const workedMinutes = completeRecords.reduce((total, record) => total + record.workedMinutes, 0);
  const lateMinutes = completeRecords.reduce((total, record) => total + record.lateMinutes, 0);
  const earlyLeaveMinutes = completeRecords.reduce((total, record) => total + record.earlyLeaveMinutes, 0);
  const overtimeMinutes = completeRecords.reduce((total, record) => total + record.overtimeMinutes, 0);
  const scheduledMinutes = expectedMinutes * importedRows;
  const attendanceRate = importedRows ? (completeShifts / importedRows) * 100 : 0;
  const hoursRate = scheduledMinutes ? (workedMinutes / scheduledMinutes) * 100 : 0;
  const punctualityRate = completeShifts && scheduledMinutes ? 100 - ((lateMinutes / scheduledMinutes) * 100) : 0;
  const score = clampPercent((attendanceRate * 0.6) + (Math.max(0, punctualityRate) * 0.25) + (Math.min(100, Math.max(0, hoursRate)) * 0.15));
  return { employeeCode, importedRows, completeShifts, reviewRows, absentRows, excusedRows, workedMinutes, lateMinutes, earlyLeaveMinutes, overtimeMinutes, score, meetsTarget: score >= targetScore };
}
