import { describe, expect, it } from "vitest";
import { toPayrollExportRows } from "./payroll-export";

describe("تصدير الرواتب", () => {
  it("يحوّل بيانات المسير إلى أعمدة عربية قابلة للتصدير", () => {
    expect(toPayrollExportRows([{ employeeCode: "P-01", employeeName: "سارة", jobTitle: "صيدلاني", basicSalary: 100, allowances: 10, kpiBonus: 5, lateDeduction: 2, absenceDeduction: 0, leaveDeduction: 0, netSalary: 113 }])[0]).toMatchObject({ "الموظف": "سارة", "صافي الراتب": 113 });
  });
});
