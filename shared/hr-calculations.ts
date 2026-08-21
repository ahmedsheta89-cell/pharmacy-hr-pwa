export type AttendanceDay = {
  scheduledMinutes: number;
  workedMinutes: number;
  lateMinutes: number;
  status: "present" | "late" | "absent" | "excused";
};

export type PayrollInput = {
  basicSalary: number;
  allowances: number;
  workingDaysInMonth: number;
  absentDays: number;
  lateMinutes: number;
  lateDeductionPerMinute: number;
  leaveDeduction: number;
  kpiScore: number;
  maximumKpiBonus: number;
};

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateAttendanceSummary(records: AttendanceDay[]) {
  const totalScheduledMinutes = records.reduce((total, record) => total + record.scheduledMinutes, 0);
  const totalWorkedMinutes = records.reduce((total, record) => total + record.workedMinutes, 0);
  const totalLateMinutes = records.reduce((total, record) => total + record.lateMinutes, 0);
  const absentDays = records.filter(record => record.status === "absent").length;
  const presentDays = records.filter(record => record.status === "present" || record.status === "late").length;
  const attendanceRate = records.length === 0 ? 0 : roundCurrency((presentDays / records.length) * 100);

  return {
    totalScheduledMinutes,
    totalWorkedMinutes,
    totalLateMinutes,
    absentDays,
    presentDays,
    attendanceRate,
  };
}

export function calculateKpiScore(actualValue: number, targetValue: number): number {
  if (targetValue <= 0 || actualValue < 0) return 0;
  return roundCurrency(Math.min((actualValue / targetValue) * 100, 100));
}

export function calculatePayroll(input: PayrollInput) {
  const safeWorkingDays = Math.max(input.workingDaysInMonth, 1);
  const safeAbsentDays = Math.max(input.absentDays, 0);
  const normalizedKpiScore = Math.max(0, Math.min(input.kpiScore, 100));
  const dailyRate = input.basicSalary / safeWorkingDays;
  const absenceDeduction = dailyRate * safeAbsentDays;
  const lateDeduction = Math.max(input.lateMinutes, 0) * Math.max(input.lateDeductionPerMinute, 0);
  const kpiBonus = Math.max(input.maximumKpiBonus, 0) * (normalizedKpiScore / 100);
  const totalDeductions = absenceDeduction + lateDeduction + Math.max(input.leaveDeduction, 0);
  const netSalary = input.basicSalary + input.allowances + kpiBonus - totalDeductions;

  return {
    dailyRate: roundCurrency(dailyRate),
    absenceDeduction: roundCurrency(absenceDeduction),
    lateDeduction: roundCurrency(lateDeduction),
    kpiBonus: roundCurrency(kpiBonus),
    totalDeductions: roundCurrency(totalDeductions),
    netSalary: roundCurrency(Math.max(netSalary, 0)),
  };
}
