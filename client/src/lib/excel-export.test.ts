import { describe, expect, it } from "vitest";
import { createExcelCompatibleCsv, createExcelWorkbook, mapAccountLinkHistoryToExcelRows, mapEmployeeAuditToExcelRows } from "./excel-export";

describe("تصدير CSV المتوافق مع Excel", () => {
  it("يحوّل تغييرات سجل الموظف إلى صفوف عربية ويحتفظ بالقيم غير المحددة", () => {
    const rows = mapEmployeeAuditToExcelRows("سارة أحمد", "EMP-01", [{
      action: "updated",
      actorName: "المالك",
      createdAt: new Date("2026-08-22T09:00:00Z"),
      changes: [{ label: "المسمى الوظيفي", before: "مساعد", after: "صيدلاني" }],
    }, {
      action: "archived",
      actorName: null,
      createdAt: new Date("2026-08-23T09:00:00Z"),
      changes: [],
    }]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject(["سارة أحمد", "EMP-01", "تعديل البيانات", "المالك", expect.any(Date), "المسمى الوظيفي", "مساعد", "صيدلاني"]);
    expect(rows[1]).toMatchObject(["سارة أحمد", "EMP-01", "أرشفة الملف", "مستخدم النظام", expect.any(Date), "—", "—", "—"]);
  });

  it("يكتب BOM للغة العربية ويمنع تنفيذ الصيغ داخل خلايا التصدير", () => {
    const csv = createExcelCompatibleCsv(["الحقل"], [["=HYPERLINK(\"https://example.test\")"]]);
    expect(csv.startsWith("\ufeff")).toBe(true);
    expect(csv).toContain("\"'=HYPERLINK(\"\"https://example.test\"\")\"");
  });

  it("ينشئ مصنف XLSX فعلياً لسجل الربط باتجاه RTL وبخلايا نصية آمنة", () => {
    const rows = mapAccountLinkHistoryToExcelRows([{
      employeeName: "سارة أحمد", employeeCode: "EMP-01", accountName: "سارة", accountEmail: "sara@example.test",
      log: { userId: 3, action: "linked", source: "owner_direct", actorName: "=مالك", createdAt: new Date("2026-08-22T09:00:00Z") },
    }]);
    const workbook = createExcelWorkbook(["الموظف", "منفذ العملية"], rows, "سجل الربط");
    expect(Array.from(workbook.slice(0, 2))).toEqual([0x50, 0x4b]);
    const content = new TextDecoder().decode(workbook);
    expect(content).toContain('rightToLeft="1"');
    expect(content).toContain("سارة أحمد");
    expect(content).toContain("&apos;=مالك");
  });
});
