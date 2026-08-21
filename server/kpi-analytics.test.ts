import { describe, expect, it } from "vitest";
import { buildSalesKpiSummary } from "../shared/kpi-analytics";

describe("buildSalesKpiSummary", () => {
  it("يجمع المبيعات والفواتير ويحسب متوسط الفاتورة وتحقيق الهدف للشهر الحالي", () => {
    const now = new Date(2026, 7, 21);
    const definitions = [
      { id: 1, category: "sales", unit: "currency", name: "مبيعات شهرية" },
      { id: 2, category: "sales", unit: "number", name: "عدد الفواتير" },
    ];
    const records = [
      { employeeId: 10, kpiDefinitionId: 1, actualValue: "12000", score: "80", periodStart: new Date(2026, 7, 1) },
      { employeeId: 11, kpiDefinitionId: 1, actualValue: "3000", score: "100", periodStart: new Date(2026, 7, 1) },
      { employeeId: 10, kpiDefinitionId: 2, actualValue: "50", score: "100", periodStart: new Date(2026, 7, 1) },
    ];

    const summary = buildSalesKpiSummary(definitions, records, now);

    expect(summary.current).toMatchObject({ sales: 15000, invoices: 50, averageInvoice: 300, targetAchievement: 90 });
    expect(summary.monthly).toHaveLength(6);
  });
});
