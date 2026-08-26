import { describe, expect, it } from "vitest";
import { createExcelCompatibleCsv, createExcelWorkbook, mapAccountLinkHistoryToExcelRows, mapBranchComparisonToExcelRows, mapDashboardReportToExcelRows, mapEmployeeAuditToExcelRows, mapOrderPortalToExcelRows } from "./excel-export";

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

  it("يضيف تقرير لوحة الدور بسياق المصدر والفترة ويحمي قيمة المؤشر من صيغة Excel", () => {
    const rows = mapDashboardReportToExcelRows({ roleLabel: "لوحة المدير", generatedAt: new Date("2026-08-25T00:00:00Z"), stats: [{ label: "التزام الفريق", value: "=100%", hint: "من سجلات الحضور" }] });
    expect(rows).toContainEqual(["مصدر البيانات", "المؤشرات الحية المصرح بها في لوحة المستخدم"]);
    const workbook = createExcelWorkbook(["الحقل", "القيمة", "التفسير"], rows, "لوحة الدور");
    expect(new TextDecoder().decode(workbook)).toContain("&apos;=100%");
  });

  it("يحوّل مقارنة الفروع الشهرية إلى صفوف مرتبة مع فرق موجب وقيم غير متاحة", () => {
    const rows = mapBranchComparisonToExcelRows([{ branchName: "فرع المنصورة", branchCode: "MAN-01", expectedDays: 22, complianceScore: 91.25, attendanceRate: 96.5, punctualityRate: 90, hoursRate: 88.75, totalLateMinutes: 45, previousComplianceScore: 88, monthlyChange: 3.25 }]);
    expect(rows[0]).toEqual([1, "فرع المنصورة", "MAN-01", 22, "91.3%", "96.5%", "90.0%", "88.8%", 45, "88.0%", "+3.3 نقطة"]);
  });

  it("يحوّل طلبات الصيدلية إلى ملف Excel بحالة عربية وسجل إدخال واضح", () => {
    const rows = mapOrderPortalToExcelRows([{ requesterName: "هبة", zoneName: "المشاية", courierName: null, order: { orderCode: "ORD-01", customerName: "عميل", customerPhone: "01000000000", itemName: "=صنف", itemCode: "MED-1", quantity: 2, address: "المنصورة", status: "contacted", createdAt: new Date("2026-08-26T10:00:00Z"), contactedAt: new Date("2026-08-26T10:10:00Z"), preparedAt: null, deliveredAt: null, notes: null } }]);
    expect(rows[0]?.slice(0, 10)).toEqual(["ORD-01", "عميل", "01000000000", "=صنف", "MED-1", 2, "تم التواصل", "هبة", "المشاية", "—"]);
    expect(new TextDecoder().decode(createExcelWorkbook(["الطلب"], rows, "طلبات"))).toContain("&apos;=صنف");
  });
});
