import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("بوابة الطلبات المنفصلة", () => {
  it("تفصل حساب الصيدلية المحدود عن إدارة المدير وتُلزم اختيار اسم قبل الإرسال", () => {
    const page = readFileSync(join(process.cwd(), "client/src/pages/OrdersPortal.tsx"), "utf8");
    expect(page).toContain("orders.portal.login.useMutation");
    expect(page).toContain("orders.portal.create.useMutation");
    expect(page).toContain("requestedByOrderStaffId");
    expect(page).toContain("orders.admin.saveAccount.useMutation");
    expect(page).toContain("downloadExcelWorkbook");
    expect(page).not.toContain("DashboardLayout");
  });
});
