import { describe, expect, it } from "vitest";
import { getMobileShortcutBadgeCount, getMobileShortcutsForRole, getNavigationForRole, normalizeLayoutRole } from "./DashboardLayout";

describe("تنقل الواجهة بحسب الدور", () => {
  it("يعرض وحدات الإدارة للمالك والمدير فقط", () => {
    const ownerPaths = getNavigationForRole("owner").map(item => item.path);
    const managerPaths = getNavigationForRole("manager").map(item => item.path);

    expect(ownerPaths).toContain("/employees");
    expect(ownerPaths).toContain("/payroll");
    expect(managerPaths).toContain("/employees");
    expect(managerPaths).toContain("/payroll");
  });

  it("يمنع الوحدات الإدارية من تنقل الصيدلاني والموظف", () => {
    for (const role of ["pharmacist", "employee"]) {
      const paths = getNavigationForRole(role).map(item => item.path);
      expect(paths).not.toContain("/employees");
      expect(paths).not.toContain("/payroll");
      expect(paths).toEqual(expect.arrayContaining(["/attendance", "/shifts", "/leaves", "/kpis"]));
    }
    expect(normalizeLayoutRole("admin")).toBe("owner");
  });

  it("يعرض الرواتب لمدير الموارد البشرية دون إظهار إدارة ملفات الموظفين", () => {
    const paths = getNavigationForRole("hr_manager").map(item => item.path);
    expect(paths).toContain("/payroll");
    expect(paths).not.toContain("/employees");
    expect(paths).not.toContain("/employee-audit-log");
    expect(normalizeLayoutRole("hr_manager")).toBe("hr_manager");
  });

  it("يبني اختصارات الهاتف من الوحدات المصرح بها فقط", () => {
    expect(getMobileShortcutsForRole("owner").map(item => item.path)).toEqual(["/", "/attendance", "/shifts", "/leaves", "/payroll"]);
    expect(getMobileShortcutsForRole("employee").map(item => item.path)).toEqual(["/", "/attendance", "/shifts", "/leaves"]);
    expect(getMobileShortcutsForRole("hr_manager").map(item => item.path)).toEqual(["/payroll"]);
  });

  it("يعرض شارة الإشعارات الجديدة على الاختصار الرئيسي فقط", () => {
    expect(getMobileShortcutBadgeCount("/", 3)).toBe(3);
    expect(getMobileShortcutBadgeCount("/attendance", 3)).toBe(0);
    expect(getMobileShortcutBadgeCount("/", -2)).toBe(0);
  });

  it("يربط المهام المعلقة باختصاراتها المناسبة إلى جانب الرسائل", () => {
    const tasks = { accountLinks: 2, leaves: 4, payroll: 1 };
    expect(getMobileShortcutBadgeCount("/", 3, tasks)).toBe(5);
    expect(getMobileShortcutBadgeCount("/leaves", 3, tasks)).toBe(4);
    expect(getMobileShortcutBadgeCount("/payroll", 3, tasks)).toBe(1);
    expect(getMobileShortcutBadgeCount("/shifts", 3, tasks)).toBe(0);
  });
});
