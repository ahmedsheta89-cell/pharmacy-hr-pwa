// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AttendanceImportPanel } from "./AttendanceImportPanel";

vi.mock("@/lib/attendance-import", async () => {
  const actual = await vi.importActual<typeof import("@/lib/attendance-import")>("@/lib/attendance-import");
  return { ...actual, downloadAttendanceImportTemplate: vi.fn() };
});

afterEach(cleanup);

describe("AttendanceImportPanel", () => {
  it("shows an accessible progress bar while the selected file is being read", () => {
    render(<AttendanceImportPanel activeBranchId={1} draft={null} error={null} applying={false} progress={{ phase: "reading", value: 25, message: "جارٍ قراءة الملف واستخراج الصفوف…" }} onSelectFile={vi.fn()} onApply={vi.fn()} />);

    expect(screen.getByText("تحميل قالب فارغ")).toBeTruthy();
    expect(screen.getByText("جارٍ قراءة الملف واستخراج الصفوف…")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "تقدم قراءة ملف الحضور" }).getAttribute("aria-valuenow")).toBe("25");
  });

  it("uses an explicit error colour and field-level reason for rows requiring review", () => {
    render(<AttendanceImportPanel activeBranchId={1} error={null} applying={false} progress={{ phase: "ready", value: 100, message: "اكتملت المعاينة" }} onSelectFile={vi.fn()} onApply={vi.fn()} draft={{ sourceFileName: "حضوروانصرافشهر7.xlsx", sourceFormat: "xlsx", headers: [], issues: [], detectedLayout: "device_report", rows: [
      { rowNumber: 9, employeeCode: "13", workDate: new Date("2026-07-08"), checkInAt: new Date("2026-07-08T11:44:55"), status: "present", issues: ["missing_time_pair"] },
    ] }} />);

    const issue = screen.getByText("وقت الحضور والانصراف يجب أن يُدخلا معاً");
    expect(issue.closest("tr")?.className).toContain("bg-red-50");
    expect(screen.getByText(/0 صف سليم مبدئياً/)).toBeTruthy();
  });
});
