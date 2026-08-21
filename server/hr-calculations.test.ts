import { describe, expect, it } from "vitest";
import { calculateAttendanceSummary, calculateKpiScore, calculatePayroll } from "../shared/hr-calculations";

describe("HR calculation engine", () => {
  it("summarizes attendance and lateness from daily records", () => {
    const summary = calculateAttendanceSummary([
      { scheduledMinutes: 480, workedMinutes: 480, lateMinutes: 0, status: "present" },
      { scheduledMinutes: 480, workedMinutes: 455, lateMinutes: 25, status: "late" },
      { scheduledMinutes: 480, workedMinutes: 0, lateMinutes: 0, status: "absent" },
    ]);

    expect(summary).toMatchObject({
      totalScheduledMinutes: 1440,
      totalWorkedMinutes: 935,
      totalLateMinutes: 25,
      absentDays: 1,
      presentDays: 2,
      attendanceRate: 66.67,
    });
  });

  it("caps KPI score at one hundred percent", () => {
    expect(calculateKpiScore(12000, 10000)).toBe(100);
    expect(calculateKpiScore(7500, 10000)).toBe(75);
    expect(calculateKpiScore(100, 0)).toBe(0);
  });

  it("calculates deductions and KPI bonus from recorded performance", () => {
    const payroll = calculatePayroll({
      basicSalary: 9000,
      allowances: 1200,
      workingDaysInMonth: 30,
      absentDays: 1,
      lateMinutes: 20,
      lateDeductionPerMinute: 2,
      leaveDeduction: 0,
      kpiScore: 80,
      maximumKpiBonus: 1000,
    });

    expect(payroll).toEqual({
      dailyRate: 300,
      absenceDeduction: 300,
      lateDeduction: 40,
      kpiBonus: 800,
      totalDeductions: 340,
      netSalary: 10660,
    });
  });
});
