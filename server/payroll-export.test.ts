import { describe, expect, it } from "vitest";
import { toPayrollExportRows } from "../shared/payroll-export";

describe("بيانات تصدير الرواتب", () => {
  it("تنتج أعمدة عربية ثابتة لملف Excel وPDF", () => {
    const [row] = toPayrollExportRows([{ employeeCode: "P-01", employeeName: "سارة", jobTitle: "صيدلاني", basicSalary: 100, allowances: 10, kpiBonus: 5, lateDeduction: 2, absenceDeduction: 0, leaveDeduction: 0, netSalary: 113 }]);
    expect(row).toMatchObject({ "الموظف": "سارة", "صافي الراتب": 113, "خصم التأخير": 2 });
  });
});
