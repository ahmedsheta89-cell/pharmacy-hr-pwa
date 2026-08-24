export type AttendanceDay = {
  scheduledMinutes: number;
  workedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes?: number;
  overtimeMinutes?: number;
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
  rewardsTotal?: number;
  penaltiesTotal?: number;
};

export type AttendanceRuleMetric = "late_minutes" | "late_occurrences" | "absence_days" | "early_leave_minutes" | "overtime_minutes";
export type AttendanceRuleAmountMode = "fixed" | "per_unit" | "daily_rate_percentage";

export function calculateAttendanceCompliance(records: AttendanceDay[]) {
  const summary = calculateAttendanceSummary(records);
  const scheduledMinutes = Math.max(summary.totalScheduledMinutes, 0);
  const hoursRate = scheduledMinutes ? Math.min(100, (Math.max(summary.totalWorkedMinutes, 0) / scheduledMinutes) * 100) : 0;
  const punctualityRate = scheduledMinutes ? Math.max(0, 100 - (Math.max(summary.totalLateMinutes, 0) / scheduledMinutes) * 100) : 0;
  const earlyLeaveMinutes = records.reduce((total, record) => total + Math.max(record.earlyLeaveMinutes ?? 0, 0), 0);
  const overtimeMinutes = records.reduce((total, record) => total + Math.max(record.overtimeMinutes ?? 0, 0), 0);
  const complianceScore = records.length === 0 ? 0 : roundCurrency((summary.attendanceRate * 0.6) + (punctualityRate * 0.25) + (hoursRate * 0.15));

  return { ...summary, hoursRate: roundCurrency(hoursRate), punctualityRate: roundCurrency(punctualityRate), earlyLeaveMinutes, overtimeMinutes, complianceScore };
}

export function calculateRuleAdjustment(input: { metricValue: number; threshold: number; direction: "at_least" | "at_most"; amountMode: AttendanceRuleAmountMode; amount: number; dailyRate: number; maximumAmount?: number | null }) {
  const threshold = Math.max(0, input.threshold);
  const meetsRule = input.direction === "at_least" ? input.metricValue >= threshold : input.metricValue <= threshold;
  const distance = input.direction === "at_least" ? input.metricValue - threshold : threshold - input.metricValue;
  const qualifyingUnits = meetsRule ? (input.amountMode === "fixed" || input.amountMode === "daily_rate_percentage" ? 1 : Math.max(1, distance)) : 0;
  const rawAmount = input.amountMode === "fixed"
    ? qualifyingUnits * input.amount
    : input.amountMode === "per_unit"
      ? qualifyingUnits * input.amount
      : qualifyingUnits * input.dailyRate * (input.amount / 100);
  const cappedAmount = input.maximumAmount === null || input.maximumAmount === undefined ? rawAmount : Math.min(rawAmount, Math.max(input.maximumAmount, 0));
  return { qualifyingUnits, amount: roundCurrency(Math.max(cappedAmount, 0)) };
}

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
  const rewardsTotal = Math.max(input.rewardsTotal ?? 0, 0);
  const penaltiesTotal = Math.max(input.penaltiesTotal ?? 0, 0);
  const totalDeductions = absenceDeduction + lateDeduction + Math.max(input.leaveDeduction, 0) + penaltiesTotal;
  const netSalary = input.basicSalary + input.allowances + kpiBonus + rewardsTotal - totalDeductions;

  return {
    dailyRate: roundCurrency(dailyRate),
    absenceDeduction: roundCurrency(absenceDeduction),
    lateDeduction: roundCurrency(lateDeduction),
    kpiBonus: roundCurrency(kpiBonus),
    rewardsTotal: roundCurrency(rewardsTotal),
    penaltiesTotal: roundCurrency(penaltiesTotal),
    totalDeductions: roundCurrency(totalDeductions),
    netSalary: roundCurrency(Math.max(netSalary, 0)),
  };
}
