// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  linkedEmployee: null as { id: number } | null,
  attendanceQuery: vi.fn(() => ({ data: null, refetch: vi.fn() })),
}));

vi.mock("../_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 2, role: "employee", name: "موظف تجريبي" } }) }));
vi.mock("../lib/trpc", () => ({
  trpc: {
    profile: {
      mine: { useQuery: () => ({ data: { employee: testState.linkedEmployee }, isSuccess: true, refetch: vi.fn() }) },
      setupEmployeeProfile: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    organization: { listBranches: { useQuery: () => ({ data: [] }) } },
    attendance: {
      mineToday: { useQuery: testState.attendanceQuery },
      checkIn: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      checkOut: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

import { AttendanceModule, getAttendanceProfileGuard } from "./ModulePage";

afterEach(cleanup);
beforeEach(() => { testState.linkedEmployee = null; testState.attendanceQuery.mockClear(); });

describe("حارس ربط الحضور", () => {
  it("يمنع تحميل طلبات الحضور ويعرض رسالة واضحة عند غياب ملف الموظف", () => {
    expect(getAttendanceProfileGuard(null)).toEqual({ canLoadAttendance: false, message: "لا يوجد ملف موظف مرتبط بحسابك" });
  });

  it("يسمح بتحميل الحضور بعد ربط ملف الموظف", () => {
    expect(getAttendanceProfileGuard({ id: 7 })).toEqual({ canLoadAttendance: true, message: null });
  });

  it("يعرض حالة الربط الناقص ولا يفعّل استعلام الحضور في الواجهة", () => {
    render(<AttendanceModule />);
    expect(screen.getByText("لا يوجد ملف موظف مرتبط بحسابك")).toBeTruthy();
    expect(screen.getByText(/لن يتم إرسال طلبات حضور حتى يكتمل الربط/)).toBeTruthy();
    expect(testState.attendanceQuery).toHaveBeenCalledWith(undefined, { enabled: false });
  });

  it("يفعّل استعلام الحضور بعد وجود ملف موظف مرتبط", () => {
    testState.linkedEmployee = { id: 7 };
    render(<AttendanceModule />);
    expect(testState.attendanceQuery).toHaveBeenCalledWith(undefined, { enabled: true });
    expect(screen.getByRole("button", { name: "تسجيل الحضور" })).toBeTruthy();
  });
});
