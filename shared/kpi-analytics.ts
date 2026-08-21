export type AnalyticsKpiDefinition = {
  id: number;
  category: string;
  unit: string;
  name: string;
};

export type AnalyticsKpiRecord = {
  employeeId: number;
  kpiDefinitionId: number;
  actualValue: string | number;
  score: string | number;
  periodStart: Date;
};

function numeric(value: string | number) {
  return Number(value) || 0;
}

function isInvoiceMetric(definition: AnalyticsKpiDefinition) {
  return definition.category === "sales" && definition.unit === "number" && /(فاتور|فواتير|invoice|receipt|ticket)/i.test(definition.name);
}

export function buildSalesKpiSummary(definitions: AnalyticsKpiDefinition[], records: AnalyticsKpiRecord[], now = new Date()) {
  const definitionById = new Map(definitions.map(definition => [definition.id, definition]));
  const monthStarts = Array.from({ length: 6 }, (_, index) => new Date(now.getFullYear(), now.getMonth() - 5 + index, 1));
  const monthly = monthStarts.map(monthStart => {
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59, 999);
    const inMonth = records.filter(record => record.periodStart >= monthStart && record.periodStart <= monthEnd);
    const salesRecords = inMonth.filter(record => {
      const definition = definitionById.get(record.kpiDefinitionId);
      return definition?.category === "sales" && definition.unit === "currency";
    });
    const invoiceRecords = inMonth.filter(record => {
      const definition = definitionById.get(record.kpiDefinitionId);
      return definition ? isInvoiceMetric(definition) : false;
    });
    const sales = salesRecords.reduce((sum, record) => sum + numeric(record.actualValue), 0);
    const invoices = invoiceRecords.reduce((sum, record) => sum + numeric(record.actualValue), 0);
    const targetAchievement = salesRecords.length
      ? Math.round(salesRecords.reduce((sum, record) => sum + numeric(record.score), 0) / salesRecords.length)
      : 0;
    return {
      month: new Intl.DateTimeFormat("ar-EG", { month: "short" }).format(monthStart),
      sales: Math.round(sales * 100) / 100,
      invoices: Math.round(invoices),
      averageInvoice: invoices > 0 ? Math.round((sales / invoices) * 100) / 100 : 0,
      targetAchievement,
    };
  });
  const current = monthly.at(-1) ?? { sales: 0, invoices: 0, averageInvoice: 0, targetAchievement: 0 };
  return { monthly, current };
}
