// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AttendanceEmployeeSchedulePanel } from "./AttendanceEmployeeSchedulePanel";

afterEach(cleanup);

describe("AttendanceEmployeeSchedulePanel", () => {
  it("applies a chosen schedule to selected employees while retaining individual controls", () => {
    const onChange = vi.fn();
    const settings = { shiftStart: "09:00", shiftEnd: "17:00", breakMinutes: 0, graceMinutes: 15, targetScore: 90 };
    render(<AttendanceEmployeeSchedulePanel settings={settings} onChange={onChange} draft={{ sourceFileName: "حضور.xlsx", sourceFormat: "xlsx", headers: [], issues: [], detectedLayout: "standard", rows: [{ rowNumber: 2, employeeCode: "EMP-01", workDate: new Date(), status: "present", issues: [] }, { rowNumber: 3, employeeCode: "EMP-02", workDate: new Date(), status: "present", issues: [] }] }} />);

    fireEvent.click(screen.getByLabelText("تحديد الموظف EMP-01"));
    fireEvent.change(screen.getByLabelText("بداية الوردية الجماعية"), { target: { value: "10:00" } });
    fireEvent.click(screen.getByRole("button", { name: /تطبيق على المحدد/ }));

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ employeeSchedules: { "EMP-01": expect.objectContaining({ shiftStart: "10:00" }) } }));
    expect(screen.getByLabelText("بداية وردية EMP-02")).toBeTruthy();
  });
});
