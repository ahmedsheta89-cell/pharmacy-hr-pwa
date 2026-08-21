import { describe, expect, it } from "vitest";
import { getNextPayrollStatus } from "../shared/payroll-approval";

describe("getNextPayrollStatus", () => {
  it("يحيل اعتماد المدير إلى الموارد البشرية عند الموافقة", () => {
    expect(getNextPayrollStatus("manager", "approved")).toBe("pending_hr");
  });

  it("يعيد أو يرفض المسير عند قرار المدير", () => {
    expect(getNextPayrollStatus("manager", "returned")).toBe("draft");
    expect(getNextPayrollStatus("manager", "rejected")).toBe("rejected");
  });

  it("يعتمد أو يعيد أو يرفض المسير عند قرار الموارد البشرية", () => {
    expect(getNextPayrollStatus("hr_manager", "approved")).toBe("approved");
    expect(getNextPayrollStatus("hr_manager", "returned")).toBe("draft");
    expect(getNextPayrollStatus("hr_manager", "rejected")).toBe("rejected");
  });
});
