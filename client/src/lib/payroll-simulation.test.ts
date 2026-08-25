import { describe, expect, it } from "vitest";
import { calculatePayrollScenario, type ScenarioAttendanceReport, type ScenarioRule } from "./payroll-simulation";

const report: ScenarioAttendanceReport = {
  employeeId: 1,
  days: [{ status: "late", lateMinutes: 12 }, { status: "late", lateMinutes: 8 }, { status: "present", lateMinutes: 0 }],
  summary: { totalLateMinutes: 20, absentDays: 1, earlyLeaveMinutes: 0, overtimeMinutes: 90, complianceScore: 84 },
};

const rule = (overrides: Partial<ScenarioRule> = {}): ScenarioRule => ({
  id: 1, name: "قاعدة اختبار", isActive: "yes", effectiveFrom: new Date("2026-01-01"), metric: "late_minutes", threshold: 10, direction: "at_least", amountMode: "per_unit", amount: 5, maximumAmount: null, adjustmentType: "penalty", requiresApproval: "yes", ...overrides,
});

describe("calculatePayrollScenario", () => {
  it("يعرض أثر القواعد النشطة فقط ولا يغيّر صافي الراتب إلى قيمة سالبة", () => {
    const result = calculatePayrollScenario({ report, rules: [rule(), rule({ id: 2, isActive: "no", amount: 100 })], from: new Date("2026-08-01"), to: new Date("2026-08-31"), basicSalary: 100, allowances: 10, workingDays: 20 });
    expect(result.rows).toHaveLength(1);
    expect(result.penalties).toBe(50);
    expect(result.estimatedNet).toBe(60);
  });

  it("يحسب مرات التأخير ويطبق سقف المبلغ ويستبعد القاعدة خارج فترة المحاكاة", () => {
    const result = calculatePayrollScenario({ report, rules: [rule({ id: 2, metric: "late_occurrences", threshold: 1, amountMode: "per_unit", amount: 30, maximumAmount: 40, adjustmentType: "reward" }), rule({ id: 3, effectiveFrom: new Date("2027-01-01") })], from: new Date("2026-08-01"), to: new Date("2026-08-31"), basicSalary: 1000, allowances: 0, workingDays: 20 });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ metric: "late_occurrences", metricValue: 2, amount: 30, adjustmentType: "reward" });
    expect(result.estimatedNet).toBe(1030);
  });

  it("يضم المكافآت والخصومات المعتمدة في التقدير مع الاحتفاظ بمصدرها للعرض", () => {
    const result = calculatePayrollScenario({ report, rules: [], from: new Date("2026-08-01"), to: new Date("2026-08-31"), basicSalary: 1000, allowances: 100, workingDays: 20, approvedAdjustments: [{ id: 10, adjustmentType: "reward", amount: 75, source: "manual", description: "مكافأة معتمدة" }, { id: 11, adjustmentType: "penalty", amount: 25, source: "manual", description: "خصم معتمد" }] });
    expect(result.approvedAdjustments).toHaveLength(2);
    expect(result.approvedRewards).toBe(75);
    expect(result.approvedPenalties).toBe(25);
    expect(result.estimatedNet).toBe(1150);
  });
});
