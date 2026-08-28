// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({ exceptionInputs: [] as unknown[], refetch: vi.fn() }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    organization: {
      listBranches: { useQuery: () => ({ data: [{ id: 1, name: "فرع الاختبار" }], isLoading: false, error: null }) },
    },
    attendance: {
      importExceptions: {
        useQuery: (input: unknown) => {
          testState.exceptionInputs.push(input);
          return {
            data: [{ employeeCode: "EMP-07", employeeName: "سارة أحمد", actorName: "مدير الفرع", actorEmail: null, exception: { id: 41, treatment: "approved_alternative", operationalStatus: "resolved", workDate: new Date("2026-08-12"), decidedAt: new Date("2026-08-12T10:00:00Z"), shiftStart: "10:00:00", shiftEnd: "18:00:00", breakMinutes: 30, graceMinutes: 15, decisionNote: "وردية بديلة معتمدة" } }],
            isLoading: false,
            error: null,
            refetch: testState.refetch,
          };
        },
      },
    },
  },
}));

import AttendanceExceptionAuditLog from "./AttendanceExceptionAuditLog";

afterEach(cleanup);
beforeEach(() => { testState.exceptionInputs.length = 0; testState.refetch.mockReset(); });

describe("سجل استثناءات الحضور", () => {
  it("يعرض تفاصيل القرار ويمرر فلاتر البحث والحالة والمعالجة مع نطاق الفرع", async () => {
    render(<AttendanceExceptionAuditLog />);
    await waitFor(() => expect(testState.exceptionInputs.at(-1)).toMatchObject({ branchId: 1, operationalStatus: "resolved", treatment: "all" }));
    expect(screen.getByText("سارة أحمد")).toBeTruthy();
    expect(screen.getAllByText("وردية بديلة معتمدة").length).toBeGreaterThan(0);
    expect(screen.getByText(/مدير الفرع/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("بحث في سجل الاستثناءات"), { target: { value: "سارة" } });
    fireEvent.change(screen.getByLabelText("فلترة سجل الاستثناءات حسب المعالجة"), { target: { value: "approved_alternative" } });
    fireEvent.change(screen.getByLabelText("فلترة سجل الاستثناءات حسب الحالة"), { target: { value: "all" } });
    await waitFor(() => expect(testState.exceptionInputs.at(-1)).toMatchObject({ branchId: 1, search: "سارة", treatment: "approved_alternative", operationalStatus: "all", from: expect.any(Date), to: expect.any(Date) }));
  });
});
