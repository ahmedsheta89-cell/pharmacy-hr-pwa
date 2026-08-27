import type { AttendanceImportDraft, AttendanceImportDraftRow } from "./attendance-import";

export type AttendanceImportAnalysisSettings = {
  shiftStart: string;
  shiftEnd: string;
  breakMinutes: number;
  graceMinutes: number;
  targetScore: number;
  employeeSchedules?: Record<string, AttendanceEmployeeSchedule>;
  exceptions?: Record<number, AttendanceImportException>;
};

export type AttendanceEmployeeSchedule = {
  shiftStart: string;
  shiftEnd: string;
  breakMinutes: number;
  graceMinutes: number;
};

export type AttendanceExceptionTreatment = "scheduled" | "approved_normal" | "approved_alternative" | "overtime_review" | "hourly_review" | "unapproved_shortfall" | "exclude_from_analysis";

export type AttendanceImportException = {
  treatment: AttendanceExceptionTreatment;
  note?: string;
  alternativeShiftStart?: string;
  alternativeShiftEnd?: string;
  alternativeBreakMinutes?: number;
  alternativeGraceMinutes?: number;
};

export type AttendanceRecordAssessment = {
  rowNumber: number;
  employeeCode: string;
  status: "on_time" | "needs_review" | "not_analyzable" | "absent" | "excused" | "excluded";
  treatment: AttendanceExceptionTreatment;
  scheduledMinutes: number;
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
  breakMinutes: 0,
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

export function expectedShiftMinutes(settings: Pick<AttendanceImportAnalysisSettings, "shiftStart" | "shiftEnd"> & Partial<Pick<AttendanceImportAnalysisSettings, "breakMinutes">>) {
  const start = toMinutes(settings.shiftStart);
  const end = toMinutes(settings.shiftEnd);
  const rawDuration = end > start ? end - start : end < start ? (24 * 60) - start + end : 0;
  return Math.max(0, rawDuration - Math.max(0, Math.min(480, Number(settings.breakMinutes) || 0)));
}

export function analyzeAttendanceImport(draft: AttendanceImportDraft, rawSettings: AttendanceImportAnalysisSettings): AttendanceImportAnalysis {
  const settings = {
    ...rawSettings,
    breakMinutes: Math.max(0, Math.min(480, Number(rawSettings.breakMinutes) || 0)),
    graceMinutes: Math.max(0, Math.min(240, Number(rawSettings.graceMinutes) || 0)),
    targetScore: clampPercent(Number(rawSettings.targetScore) || 0),
  };
  const expectedMinutes = expectedShiftMinutes(settings);
  const assessments = draft.rows.map(row => {
    const exception = settings.exceptions?.[row.rowNumber];
    const schedule = resolveEmployeeSchedule(row.employeeCode, settings, exception);
    return assessRow(row, schedule, exception);
  });
  const byEmployee = new Map<string, AttendanceRecordAssessment[]>();
  assessments.forEach(assessment => {
    const key = assessment.employeeCode || "بدون كود";
    byEmployee.set(key, [...(byEmployee.get(key) ?? []), assessment]);
  });
  const employees = Array.from(byEmployee.entries()).map(([employeeCode, records]) => summarizeEmployee(employeeCode, records, settings.targetScore)).sort((left, right) => left.employeeCode.localeCompare(right.employeeCode, "en"));
  const reviewRows = assessments.filter(assessment => assessment.status === "needs_review" || assessment.status === "not_analyzable").length;

  return { expectedShiftMinutes: expectedMinutes, totalRows: draft.rows.length, validRows: draft.rows.length - reviewRows, reviewRows, employeeCount: employees.length, assessments, employees };
}

function resolveEmployeeSchedule(employeeCode: string, settings: AttendanceImportAnalysisSettings, exception?: AttendanceImportException): AttendanceEmployeeSchedule {
  const key = employeeCode.trim().toUpperCase();
  const assigned = settings.employeeSchedules?.[key];
  const base = { shiftStart: assigned?.shiftStart ?? settings.shiftStart, shiftEnd: assigned?.shiftEnd ?? settings.shiftEnd, breakMinutes: assigned?.breakMinutes ?? settings.breakMinutes, graceMinutes: assigned?.graceMinutes ?? settings.graceMinutes };
  if (exception?.treatment !== "approved_alternative") return base;
  return { shiftStart: exception.alternativeShiftStart ?? base.shiftStart, shiftEnd: exception.alternativeShiftEnd ?? base.shiftEnd, breakMinutes: exception.alternativeBreakMinutes ?? base.breakMinutes, graceMinutes: exception.alternativeGraceMinutes ?? base.graceMinutes };
}

function assessRow(row: AttendanceImportDraftRow, rawSchedule: AttendanceEmployeeSchedule, exception?: AttendanceImportException): AttendanceRecordAssessment {
  const schedule = { ...rawSchedule, breakMinutes: Math.max(0, Math.min(480, Number(rawSchedule.breakMinutes) || 0)), graceMinutes: Math.max(0, Math.min(240, Number(rawSchedule.graceMinutes) || 0)) };
  const treatment = exception?.treatment ?? "scheduled";
  const expectedMinutes = expectedShiftMinutes(schedule);
  const base = { rowNumber: row.rowNumber, employeeCode: row.employeeCode, treatment, scheduledMinutes: expectedMinutes, workedMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0 };
  if (treatment === "exclude_from_analysis") return { ...base, scheduledMinutes: 0, status: "excluded", reasons: [exception?.note || "استُبعد السجل من التحليل بقرار المدير"] };
  if (row.issues.length || !expectedMinutes) return { ...base, status: "not_analyzable", reasons: row.issues.length ? row.issues : ["راجع أوقات الوردية؛ لا يمكن أن تتساوى البداية والنهاية"] };
  if (row.status === "absent") return { ...base, status: "absent", reasons: ["غياب مسجل في الملف"] };
  if (row.status === "excused") return { ...base, scheduledMinutes: 0, status: "excused", reasons: ["حالة بعذر مستثناة من درجة الالتزام"] };
  if (treatment === "approved_normal") return { ...base, status: "on_time", workedMinutes: expectedMinutes, reasons: [exception?.note || "استثناء معتمد؛ يُعامل كيوم عمل عادي"] };
  const start = toMinutes(schedule.shiftStart);
  const end = toMinutes(schedule.shiftEnd);
  const overnight = end < start;
  const rawCheckIn = timeOfDay(row.checkInAt);
  const rawCheckOut = timeOfDay(row.checkOutAt);
  if (rawCheckIn === undefined || rawCheckOut === undefined) return { ...base, status: "not_analyzable", reasons: ["وقت الحضور والانصراف غير صالح للتحليل"] };
  const checkIn = overnight && rawCheckIn < start ? rawCheckIn + (24 * 60) : rawCheckIn;
  const checkOut = overnight && rawCheckOut <= start ? rawCheckOut + (24 * 60) : rawCheckOut;
  const scheduledEnd = overnight ? end + (24 * 60) : end;
  if (checkOut <= checkIn) return { ...base, status: "not_analyzable", reasons: ["وقت الانصراف غير صالح للوردية المحددة"] };
  const workedMinutes = Math.max(0, checkOut - checkIn - schedule.breakMinutes);
  if (treatment === "hourly_review") return { ...base, scheduledMinutes: 0, status: "needs_review", workedMinutes, reasons: [exception?.note || "يُعرض الوقت الفعلي ساعة بساعة؛ لا يدخل في الدرجة حتى المراجعة"] };
  const lateMinutes = Math.max(0, checkIn - start - schedule.graceMinutes);
  const earlyLeaveMinutes = Math.max(0, scheduledEnd - checkOut);
  const overtimeMinutes = Math.max(0, checkOut - scheduledEnd);
  const reasons = [lateMinutes ? `تأخر ${lateMinutes} د` : "", earlyLeaveMinutes ? `انصراف مبكر ${earlyLeaveMinutes} د` : "", treatment === "overtime_review" && overtimeMinutes ? `إضافي ${overtimeMinutes} د للمراجعة` : "", treatment === "unapproved_shortfall" ? (exception?.note || "عجز غير معتمد؛ للمراجعة قبل أي قرار") : ""].filter(Boolean);
  return { ...base, status: reasons.length ? "needs_review" : "on_time", workedMinutes, lateMinutes, earlyLeaveMinutes, overtimeMinutes, reasons: reasons.length ? reasons : ["مطابق لوردية الموظف المحددة"] };
}

function summarizeEmployee(employeeCode: string, records: AttendanceRecordAssessment[], targetScore: number): EmployeeAttendanceAssessment {
  const completeRecords = records.filter(record => record.status === "on_time" || record.status === "needs_review");
  const scoreRecords = records.filter(record => record.status !== "excluded" && record.status !== "excused" && record.treatment !== "hourly_review");
  const importedRows = records.filter(record => record.status !== "excluded").length;
  const completeShifts = completeRecords.length;
  const reviewRows = records.filter(record => record.status === "needs_review" || record.status === "not_analyzable").length;
  const absentRows = records.filter(record => record.status === "absent").length;
  const excusedRows = records.filter(record => record.status === "excused").length;
  const workedMinutes = completeRecords.reduce((total, record) => total + record.workedMinutes, 0);
  const lateMinutes = completeRecords.reduce((total, record) => total + record.lateMinutes, 0);
  const earlyLeaveMinutes = completeRecords.reduce((total, record) => total + record.earlyLeaveMinutes, 0);
  const overtimeMinutes = completeRecords.reduce((total, record) => total + record.overtimeMinutes, 0);
  const scheduledMinutes = scoreRecords.reduce((total, record) => total + record.scheduledMinutes, 0);
  const attendanceRate = scoreRecords.length ? (completeShifts / scoreRecords.length) * 100 : 0;
  const hoursRate = scheduledMinutes ? (workedMinutes / scheduledMinutes) * 100 : 0;
  const punctualityRate = completeShifts && scheduledMinutes ? 100 - ((lateMinutes / scheduledMinutes) * 100) : 0;
  const score = clampPercent((attendanceRate * 0.6) + (Math.max(0, punctualityRate) * 0.25) + (Math.min(100, Math.max(0, hoursRate)) * 0.15));
  return { employeeCode, importedRows, completeShifts, reviewRows, absentRows, excusedRows, workedMinutes, lateMinutes, earlyLeaveMinutes, overtimeMinutes, score, meetsTarget: score >= targetScore };
}
