// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  auditInputs: [] as unknown[],
  refetch: vi.fn(),
}));

vi.mock("../lib/trpc", () => ({
  trpc: {
    organization: { listBranches: { useQuery: () => ({ data: [{ id: 1, name: "فرع الاختبار" }], isLoading: false, error: null }) } },
    employees: {
      list: { useQuery: () => ({ data: [{ id: 7, fullName: "سارة أحمد", employeeCode: "EMP-07" }], isLoading: false, error: null }) },
      auditLog: { useQuery: (input: unknown) => { testState.auditInputs.push(input); return { data: [{ id: 31, action: "updated", actorName: "المالك", createdAt: new Date("2026-08-22T09:00:00Z"), changes: [{ label: "الدور", before: "مساعد", after: "صيدلاني" }] }], isLoading: false, error: null, refetch: testState.refetch }; } },
    },
  },
}));

import EmployeeAuditLog from "./EmployeeAuditLog";

afterEach(cleanup);
beforeEach(() => {
  testState.auditInputs.length = 0;
  testState.refetch.mockReset();
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
});

describe("بحث وتصدير سجل تدقيق الموظف", () => {
  it("يمرر فلاتر البحث والتاريخ ويصدر النتائج الظاهرة كملف XLSX", async () => {
    render(<EmployeeAuditLog />);
    await waitFor(() => expect(testState.auditInputs.at(-1)).toMatchObject({ employeeId: 7 }));
    fireEvent.change(screen.getByPlaceholderText("الحقل أو القيمة أو المنفذ"), { target: { value: "صيدلاني" } });
    fireEvent.change(screen.getByLabelText("من تاريخ"), { target: { value: "2026-08-01" } });
    await waitFor(() => expect(testState.auditInputs.at(-1)).toMatchObject({ employeeId: 7, search: "صيدلاني", from: expect.any(Date) }));
    const exportButton = screen.getByRole("button", { name: "تصدير Excel" });
    expect(exportButton.getAttribute("disabled")).toBeNull();
    fireEvent.click(exportButton);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  });
});
