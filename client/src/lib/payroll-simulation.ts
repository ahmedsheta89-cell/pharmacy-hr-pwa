import { calculateRuleAdjustment } from "@shared/hr-calculations";

export type ScenarioMetric = "late_minutes" | "late_occurrences" | "absence_days" | "early_leave_minutes" | "overtime_minutes";

export type ScenarioRule = {
  id: number;
  name: string;
  isActive: "yes" | "no";
  effectiveFrom: Date | string;
  effectiveTo?: Date | string | null;
  metric: ScenarioMetric;
  threshold: number | string;
  direction: "at_least" | "at_most";
  amountMode: "fixed" | "per_unit" | "daily_rate_percentage";
  amount: number | string;
  maximumAmount?: number | string | null;
  adjustmentType: "reward" | "penalty";
  requiresApproval: "yes" | "no";
};

export type ScenarioAttendanceReport = {
  employeeId: number;
  days: Array<{ status: "present" | "late" | "absent" | "excused"; lateMinutes: number }>;
  summary: {
    totalLateMinutes: number;
    absentDays: number;
    earlyLeaveMinutes: number;
    overtimeMinutes: number;
    complianceScore: number;
  };
};

export type ScenarioApprovedAdjustment = {
  id: number;
  adjustmentType: "reward" | "penalty";
  amount: number | string;
  source: "automatic_rule" | "manual";
  description: string;
  occurrenceDate?: Date | string | null;
};

export const scenarioMetricLabels: Record<ScenarioMetric, string> = {
  late_minutes: "دقائق التأخير",
  late_occurrences: "مرات التأخير",
  absence_days: "أيام الغياب",
  early_leave_minutes: "الانصراف المبكر",
  overtime_minutes: "العمل الإضافي",
};

export function calculatePayrollScenario(input: {
  report?: ScenarioAttendanceReport;
  rules: ScenarioRule[];
  from: Date;
  to: Date;
  basicSalary: number;
  allowances: number;
  workingDays: number;
  approvedAdjustments?: ScenarioApprovedAdjustment[];
}) {
  const basicSalary = Math.max(input.basicSalary, 0);
  const allowances = Math.max(input.allowances, 0);
  const dailyRate = basicSalary / Math.max(input.workingDays, 1);
  const approvedAdjustments = input.approvedAdjustments ?? [];
  const approvedRewards = approvedAdjustments.filter(adjustment => adjustment.adjustmentType === "reward").reduce((total, adjustment) => total + Number(adjustment.amount), 0);
  const approvedPenalties = approvedAdjustments.filter(adjustment => adjustment.adjustmentType === "penalty").reduce((total, adjustment) => total + Number(adjustment.amount), 0);
  if (!input.report) return { rows: [], approvedAdjustments, ruleRewards: 0, rulePenalties: 0, approvedRewards, approvedPenalties, rewards: approvedRewards, penalties: approvedPenalties, estimatedNet: Math.max(basicSalary + allowances + approvedRewards - approvedPenalties, 0) };
  const occurrenceCount = input.report.days.filter(day => day.status === "late" || day.lateMinutes > 0).length;
  const values: Record<ScenarioMetric, number> = {
    late_minutes: input.report.summary.totalLateMinutes,
    late_occurrences: occurrenceCount,
    absence_days: input.report.summary.absentDays,
    early_leave_minutes: input.report.summary.earlyLeaveMinutes,
    overtime_minutes: input.report.summary.overtimeMinutes,
  };
  const rows = input.rules
    .filter(rule => rule.isActive === "yes" && new Date(rule.effectiveFrom) <= input.to && (!rule.effectiveTo || new Date(rule.effectiveTo) >= input.from))
    .map(rule => {
      const computed = calculateRuleAdjustment({ metricValue: values[rule.metric], threshold: Number(rule.threshold), direction: rule.direction, amountMode: rule.amountMode, amount: Number(rule.amount), dailyRate, maximumAmount: rule.maximumAmount === null || rule.maximumAmount === undefined ? null : Number(rule.maximumAmount) });
      return { ...rule, metricValue: values[rule.metric], ...computed };
    })
    .filter(row => row.amount > 0);
  const ruleRewards = rows.filter(row => row.adjustmentType === "reward").reduce((total, row) => total + row.amount, 0);
  const rulePenalties = rows.filter(row => row.adjustmentType === "penalty").reduce((total, row) => total + row.amount, 0);
  const rewards = ruleRewards + approvedRewards;
  const penalties = rulePenalties + approvedPenalties;
  return { rows, approvedAdjustments, ruleRewards, rulePenalties, approvedRewards, approvedPenalties, rewards, penalties, estimatedNet: Math.max(basicSalary + allowances + rewards - penalties, 0) };
}
