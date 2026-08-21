export type PayrollExportRow = { employeeCode: string; employeeName: string; jobTitle: string; basicSalary: number; allowances: number; kpiBonus: number; lateDeduction: number; absenceDeduction: number; leaveDeduction: number; netSalary: number };

export function toPayrollExportRows(rows: PayrollExportRow[]) {
  return rows.map(row => ({ "الكود الوظيفي": row.employeeCode, "الموظف": row.employeeName, "المسمى الوظيفي": row.jobTitle, "الراتب الأساسي": row.basicSalary, "البدلات": row.allowances, "مكافأة KPI": row.kpiBonus, "خصم التأخير": row.lateDeduction, "خصم الغياب": row.absenceDeduction, "خصم الإجازات": row.leaveDeduction, "صافي الراتب": row.netSalary }));
}
