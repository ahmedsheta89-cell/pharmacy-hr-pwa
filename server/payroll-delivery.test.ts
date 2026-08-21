import { describe, expect, it } from "vitest";
import { getPayrollDeliveryReadiness } from "../shared/payroll-delivery";

describe("getPayrollDeliveryReadiness", () => {
  it("لا يجهز الكشف للتنزيل قبل اكتمال الاعتماد", () => {
    expect(getPayrollDeliveryReadiness("pending_hr")).toMatchObject({ ready: false, label: "بانتظار الاعتماد" });
  });

  it("يجهز الكشف المعتمد أو المدفوع للتنزيل اليدوي فقط", () => {
    expect(getPayrollDeliveryReadiness("approved")).toMatchObject({ ready: true, label: "جاهز للتنزيل" });
    expect(getPayrollDeliveryReadiness("paid")).toMatchObject({ ready: true, label: "تم الصرف" });
  });
});
