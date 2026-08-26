import { describe, expect, it } from "vitest";
import { calculateAttendanceCompliance, calculateAttendanceSummary, calculateKpiScore, calculatePayroll, calculateRuleAdjustment } from "../shared/hr-calculations";

describe("HR calculation engine", () => {
  it("summarizes attendance and lateness from daily records", () => {
    const summary = calculateAttendanceSummary([
      { scheduledMinutes: 480, workedMinutes: 480, lateMinutes: 0, status: "present" },
      { scheduledMinutes: 480, workedMinutes: 455, lateMinutes: 25, status: "late" },
      { scheduledMinutes: 480, workedMinutes: 0, lateMinutes: 0, status: "absent" },
    ]);

    expect(summary).toMatchObject({ totalScheduledMinutes: 1440, totalWorkedMinutes: 935, totalLateMinutes: 25, absentDays: 1, presentDays: 2, attendanceRate: 66.67 });
  });

  it("caps KPI score at one hundred percent", () => {
    expect(calculateKpiScore(12000, 10000)).toBe(100);
    expect(calculateKpiScore(7500, 10000)).toBe(75);
    expect(calculateKpiScore(100, 0)).toBe(0);
  });

  it("scores lower-is-better KPI metrics without exceeding one hundred percent", () => {
    expect(calculateKpiScore(5, 10, "lower_better")).toBe(100);
    expect(calculateKpiScore(20, 10, "lower_better")).toBe(50);
    expect(calculateKpiScore(0, 10, "lower_better")).toBe(100);
  });

  it("calculates a transparent compliance score from attendance, punctuality, and worked hours", () => {
    const compliance = calculateAttendanceCompliance([
      { scheduledMinutes: 480, workedMinutes: 480, lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 20, status: "present" },
      { scheduledMinutes: 480, workedMinutes: 450, lateMinutes: 15, earlyLeaveMinutes: 15, overtimeMinutes: 0, status: "late" },
    ]);

    expect(compliance).toMatchObject({ presentDays: 2, absentDays: 0, totalLateMinutes: 15, earlyLeaveMinutes: 15, overtimeMinutes: 20, attendanceRate: 100, hoursRate: 96.88, punctualityRate: 98.44, complianceScore: 99.14 });
  });

  it("evaluates fixed, per-unit, and capped attendance rules deterministically", () => {
    expect(calculateRuleAdjustment({ metricValue: 40, threshold: 15, direction: "at_least", amountMode: "fixed", amount: 75, dailyRate: 300 })).toEqual({ qualifyingUnits: 1, amount: 75 });
    expect(calculateRuleAdjustment({ metricValue: 4, threshold: 1, direction: "at_least", amountMode: "per_unit", amount: 10, dailyRate: 300 })).toEqual({ qualifyingUnits: 3, amount: 30 });
    expect(calculateRuleAdjustment({ metricValue: 90, threshold: 100, direction: "at_most", amountMode: "daily_rate_percentage", amount: 50, dailyRate: 300, maximumAmount: 120 })).toEqual({ qualifyingUnits: 1, amount: 120 });
  });

  it("calculates deductions, rewards, penalties, and KPI bonus from recorded performance", () => {
    const payroll = calculatePayroll({ basicSalary: 9000, allowances: 1200, workingDaysInMonth: 30, absentDays: 1, lateMinutes: 20, lateDeductionPerMinute: 2, leaveDeduction: 0, kpiScore: 80, maximumKpiBonus: 1000, rewardsTotal: 150, penaltiesTotal: 60 });

    expect(payroll).toEqual({ dailyRate: 300, absenceDeduction: 300, lateDeduction: 40, kpiBonus: 800, rewardsTotal: 150, penaltiesTotal: 60, totalDeductions: 400, netSalary: 10750 });
  });
});
