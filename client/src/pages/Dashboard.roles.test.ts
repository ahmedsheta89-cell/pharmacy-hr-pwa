import { describe, expect, it } from "vitest";
import { normalizeDashboardRole, roleDashboardConfigs } from "./Dashboard";

describe("لوحات الأدوار", () => {
  it("تختار لوحة مستقلة للمالك والمدير والصيدلاني والموظف", () => {
    expect(normalizeDashboardRole("admin")).toBe("owner");
    expect(normalizeDashboardRole("owner")).toBe("owner");
    expect(normalizeDashboardRole("manager")).toBe("manager");
    expect(normalizeDashboardRole("pharmacist")).toBe("pharmacist");
    expect(normalizeDashboardRole("user")).toBe("employee");
  });

  it("يوجه كل دور إلى وحداته التشغيلية المناسبة", () => {
    expect(roleDashboardConfigs.owner.actions.map(action => action.path)).toContain("/payroll");
    expect(roleDashboardConfigs.manager.actions.map(action => action.path)).toContain("/attendance");
    expect(roleDashboardConfigs.pharmacist.actions.map(action => action.path)).not.toContain("/employees");
    expect(roleDashboardConfigs.employee.actions.map(action => action.path)).toEqual(["/shifts", "/leaves", "/kpis"]);
  });
});
