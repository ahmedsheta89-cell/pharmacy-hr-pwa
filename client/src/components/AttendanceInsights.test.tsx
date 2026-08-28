// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AttendanceInsights } from "./AttendanceInsights";

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
afterEach(cleanup);

describe("لوحة تحليلات الحضور والورديات", () => {
  it("تعرض ساعات الوردية المخططة والفعلية وتسمح بالتركيز على موظف محدد", () => {
    render(<AttendanceInsights report={[
      { employeeId: 7, employeeCode: "EMP-07", fullName: "سارة أحمد", expectedDays: 5, summary: { presentDays: 5, absentDays: 0, totalLateMinutes: 12, totalWorkedMinutes: 2_340, totalScheduledMinutes: 2_400, earlyLeaveMinutes: 30, overtimeMinutes: 60, attendanceRate: 100, punctualityRate: 99.5, hoursRate: 97.5, complianceScore: 99 } },
      { employeeId: 8, employeeCode: "EMP-08", fullName: "منى خالد", expectedDays: 5, summary: { presentDays: 4, absentDays: 1, totalLateMinutes: 45, totalWorkedMinutes: 1_900, totalScheduledMinutes: 2_400, earlyLeaveMinutes: 70, overtimeMinutes: 0, attendanceRate: 80, punctualityRate: 98, hoursRate: 79.2, complianceScore: 84 } },
    ]} />);

    expect(screen.getByRole("region", { name: "لوحة تحليلات الحضور" })).toBeTruthy();
    expect(screen.getByText("ورديات مخططة")).toBeTruthy();
    expect(screen.getByText("الساعات المخططة والفعلية")).toBeTruthy();
    expect(screen.getByText("المخطط 80.0 س")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("تركيز على موظف"), { target: { value: "7" } });
    expect(screen.getByText("ملخص سارة أحمد")).toBeTruthy();
  });
});
