// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { exportAttendanceImportErrorRows } from "@/lib/attendance-import";
import { AttendanceImportPanel } from "./AttendanceImportPanel";

vi.mock("@/lib/attendance-import", async () => {
  const actual = await vi.importActual<typeof import("@/lib/attendance-import")>("@/lib/attendance-import");
  return { ...actual, downloadAttendanceImportTemplate: vi.fn(), exportAttendanceImportErrorRows: vi.fn() };
});

afterEach(cleanup);

describe("AttendanceImportPanel", () => {
  it("shows an accessible progress bar while the selected file is being read", () => {
    render(<AttendanceImportPanel activeBranchId={1} draft={null} error={null} applying={false} progress={{ phase: "reading", value: 25, message: "جارٍ قراءة الملف واستخراج الصفوف…" }} onSelectFile={vi.fn()} onUpdateDraft={vi.fn()} onApply={vi.fn()} />);

    expect(screen.getByText("تحميل قالب فارغ")).toBeTruthy();
    expect(screen.getByText("جارٍ قراءة الملف واستخراج الصفوف…")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "تقدم قراءة ملف الحضور" }).getAttribute("aria-valuenow")).toBe("25");
  });

  it("uses an explicit error colour and field-level reason for rows requiring review", () => {
    render(<AttendanceImportPanel activeBranchId={1} error={null} applying={false} progress={{ phase: "ready", value: 100, message: "اكتملت المعاينة" }} onSelectFile={vi.fn()} onUpdateDraft={vi.fn()} onApply={vi.fn()} draft={{ sourceFileName: "حضوروانصرافشهر7.xlsx", sourceFormat: "xlsx", headers: [], issues: [], detectedLayout: "device_report", rows: [
      { rowNumber: 9, employeeCode: "13", workDate: new Date("2026-07-08"), checkInAt: new Date("2026-07-08T11:44:55"), status: "present", issues: ["missing_time_pair"] },
    ] }} />);

    const issue = screen.getByText("وقت الحضور والانصراف يجب أن يُدخلا معاً");
    expect(issue.closest("tr")?.className).toContain("bg-red-50");
    expect(screen.getByLabelText("جاهزة للاعتماد: 0")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "تصدير صفوف المراجعة" }));
    expect(exportAttendanceImportErrorRows).toHaveBeenCalledWith("حضوروانصرافشهر7.xlsx", expect.any(Array));
  });

  it("revalidates an error row directly when the missing checkout time is corrected", () => {
    const onUpdateDraft = vi.fn();
    render(<AttendanceImportPanel activeBranchId={1} error={null} applying={false} progress={{ phase: "ready", value: 100, message: "اكتملت المعاينة" }} onSelectFile={vi.fn()} onUpdateDraft={onUpdateDraft} onApply={vi.fn()} draft={{ sourceFileName: "حضور.xlsx", sourceFormat: "xlsx", headers: [], issues: [], detectedLayout: "standard", rows: [
      { rowNumber: 4, employeeCode: "13", workDate: new Date("2026-07-08"), checkInAt: new Date("2026-07-08T11:44:00"), status: "present", issues: ["missing_time_pair"] },
    ] }} />);

    fireEvent.change(screen.getByLabelText("وقت الانصراف في الصف 4"), { target: { value: "18:00" } });

    expect(onUpdateDraft).toHaveBeenCalledWith(expect.objectContaining({ rows: [expect.objectContaining({ rowNumber: 4, issues: [] })] }));
    expect(screen.getByRole("button", { name: "تصدير صفوف المراجعة" })).toBeTruthy();
  });

  it("searches review rows and removes selected error rows from the local preview only", () => {
    const onUpdateDraft = vi.fn();
    render(<AttendanceImportPanel activeBranchId={1} error={null} applying={false} progress={{ phase: "ready", value: 100, message: "اكتملت المعاينة" }} onSelectFile={vi.fn()} onUpdateDraft={onUpdateDraft} onApply={vi.fn()} draft={{ sourceFileName: "حضور.xlsx", sourceFormat: "xlsx", headers: [], issues: [], detectedLayout: "standard", rows: [
      { rowNumber: 4, employeeCode: "13", workDate: new Date("2026-07-08"), checkInAt: new Date("2026-07-08T11:44:00"), status: "present", issues: ["missing_time_pair"] },
      { rowNumber: 5, employeeCode: "EMP-200", workDate: new Date("2026-07-08"), checkInAt: new Date("2026-07-08T09:00:00"), checkOutAt: new Date("2026-07-08T17:00:00"), status: "present", issues: [] },
    ] }} />);

    fireEvent.change(screen.getByLabelText("البحث في معاينة الحضور"), { target: { value: "EMP-200" } });
    expect(screen.getAllByText("EMP-200").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("البحث في معاينة الحضور"), { target: { value: "" } });
    fireEvent.click(screen.getByLabelText("تحديد كل المتعثرة"));
    fireEvent.click(screen.getByRole("button", { name: "حذف المحدد (1)" }));

    expect(onUpdateDraft).toHaveBeenCalledWith(expect.objectContaining({ rows: [expect.objectContaining({ rowNumber: 5 })] }));
  });

  it("requires a final summary confirmation before applying eligible rows", () => {
    const onApply = vi.fn();
    render(<AttendanceImportPanel activeBranchId={1} error={null} applying={false} progress={{ phase: "ready", value: 100, message: "اكتملت المعاينة" }} onSelectFile={vi.fn()} onUpdateDraft={vi.fn()} onApply={onApply} draft={{ sourceFileName: "حضور.xlsx", sourceFormat: "xlsx", headers: [], issues: [], detectedLayout: "standard", rows: [
      { rowNumber: 5, employeeCode: "EMP-200", workDate: new Date("2026-07-08"), checkInAt: new Date("2026-07-08T09:00:00"), checkOutAt: new Date("2026-07-08T17:00:00"), status: "present", issues: [] },
    ] }} />);

    fireEvent.click(screen.getByRole("button", { name: "مراجعة الاعتماد" }));
    expect(screen.getByRole("heading", { name: "تأكيد اعتماد بيانات الحضور" })).toBeTruthy();
    expect(screen.getByText("سيُعتمد")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "تأكيد اعتماد الصفوف السليمة" }));
    expect(onApply).toHaveBeenCalledTimes(1);
  });
});
