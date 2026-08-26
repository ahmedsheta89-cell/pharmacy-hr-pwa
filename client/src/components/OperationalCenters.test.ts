import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("مراكز التشغيل الموحّدة", () => {
  it("يحافظ مركز جاهزية الرواتب على حد الإحالة فقط ولا ينشئ حركة مالية", () => {
    const component = readFileSync(join(process.cwd(), "client/src/components/PayrollReadinessCenter.tsx"), "utf8");

    expect(component).toContain("payroll.readiness.useQuery");
    expect(component).toContain("submitBatchForApproval.useMutation");
    expect(component).toContain("لا تنشئ خصماً أو بند راتب أو عملية صرف");
    expect(component).not.toContain("payroll.generate");
  });

  it("يربط مركز KPI بالحالة الفعلية والمالك والاتجاه دون وصفه كقرار وظيفي", () => {
    const component = readFileSync(join(process.cwd(), "client/src/components/KpiOperationsCenter.tsx"), "utf8");

    expect(component).toContain("kpis.operationsSnapshot.useQuery");
    expect(component).toContain("المالك");
    expect(component).toContain("الأقل أفضل");
    expect(component).toContain("لا يمثل حكماً وظيفياً أو قراراً مالياً");
  });
});
