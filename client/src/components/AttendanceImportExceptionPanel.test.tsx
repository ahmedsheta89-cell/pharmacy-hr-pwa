// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AttendanceImportExceptionPanel } from "./AttendanceImportExceptionPanel";

afterEach(cleanup);

describe("AttendanceImportExceptionPanel", () => {
  it("records an approved alternative-shift decision for a dated attendance exception", () => {
    const onChange = vi.fn();
    const draft = { sourceFileName: "حضور.xlsx", sourceFormat: "xlsx" as const, headers: [], issues: [], detectedLayout: "standard" as const, rows: [{ rowNumber: 2, employeeCode: "EMP-01", workDate: new Date("2026-07-01"), checkInAt: new Date("2026-07-01T11:00:00"), checkOutAt: new Date("2026-07-01T19:00:00"), status: "present" as const, issues: [] }] };
    const analysis = { expectedShiftMinutes: 480, totalRows: 1, validRows: 1, reviewRows: 1, employeeCount: 1, employees: [], assessments: [{ rowNumber: 2, employeeCode: "EMP-01", status: "needs_review" as const, treatment: "scheduled" as const, scheduledMinutes: 480, workedMinutes: 480, lateMinutes: 105, earlyLeaveMinutes: 0, overtimeMinutes: 120, reasons: ["تأخر 105 د"] }] };
    function Harness() { const [settings, setSettings] = React.useState({ shiftStart: "09:00", shiftEnd: "17:00", breakMinutes: 0, graceMinutes: 15, targetScore: 90 }); return <AttendanceImportExceptionPanel settings={settings} onChange={next => { onChange(next); setSettings(next); }} draft={draft} analysis={analysis} />; }
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("معاملة الصف 2"), { target: { value: "approved_alternative" } });

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ exceptions: { 2: expect.objectContaining({ treatment: "approved_alternative" }) } }));
    expect(screen.getByLabelText("بداية بديلة للصف 2")).toBeTruthy();
  });
});
