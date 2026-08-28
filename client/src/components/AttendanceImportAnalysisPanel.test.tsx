// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AttendanceImportAnalysisPanel } from "./AttendanceImportAnalysisPanel";

const exportState = vi.hoisted(() => ({ pdfExport: vi.fn() }));

vi.mock("@/lib/attendance-import-analysis-export", () => ({ exportAttendanceImportAnalysisExcel: vi.fn(), exportAttendanceImportAnalysisPdf: exportState.pdfExport }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    policies: {
      attendance: { useQuery: () => ({ data: null, refetch: vi.fn() }) },
      saveImportAnalysis: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    attendance: {
      importSchedules: { useQuery: () => ({ data: [], isLoading: false, refetch: vi.fn() }) },
      importExceptions: { useQuery: () => ({ data: [], isLoading: false, refetch: vi.fn() }) },
      saveImportSchedules: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

vi.stubGlobal("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

afterEach(cleanup);

describe("AttendanceImportAnalysisPanel", () => {
  it("asks for the shift settings and reports the uploaded batch by employee", () => {
    render(<AttendanceImportAnalysisPanel activeBranchId={1} draft={{ sourceFileName: "حضور.xlsx", sourceFormat: "xlsx", headers: [], issues: [], detectedLayout: "device_report", rows: [
      { rowNumber: 4, employeeCode: "EMP-01", workDate: new Date("2026-07-01"), checkInAt: new Date("2026-07-01T09:00:00"), checkOutAt: new Date("2026-07-01T17:00:00"), status: "present", issues: [] },
      { rowNumber: 5, employeeCode: "EMP-02", workDate: new Date("2026-07-01"), status: "absent", issues: [] },
    ] }} />);

    expect(screen.getByRole("heading", { name: "تحليل دفعة الحضور قبل الاعتماد" })).toBeTruthy();
    expect(screen.getByLabelText("بداية الوردية للتحليل")).toBeTruthy();
    expect(screen.getByLabelText("سماحية التأخير بالدقائق")).toBeTruthy();
    expect(screen.getByText("صفوف الشيت")).toBeTruthy();
    expect(screen.getByText("موظفون في الدفعة")).toBeTruthy();
    expect(screen.getAllByText("EMP-01").length).toBeGreaterThan(0);
    expect(screen.getAllByText("EMP-02").length).toBeGreaterThan(0);
  });

  it("shows a non-repeatable loading state and completion notice while exporting the PDF", async () => {
    let finishExport: ((value: { filename: string }) => void) | undefined;
    exportState.pdfExport.mockImplementationOnce(() => new Promise(resolve => { finishExport = resolve; }));
    render(<AttendanceImportAnalysisPanel activeBranchId={1} draft={{ sourceFileName: "حضور.xlsx", sourceFormat: "xlsx", headers: [], issues: [], detectedLayout: "standard", rows: [{ rowNumber: 2, employeeCode: "EMP-01", workDate: new Date("2026-07-01"), checkInAt: new Date("2026-07-01T09:00:00"), checkOutAt: new Date("2026-07-01T17:00:00"), status: "present", issues: [] }] }} />);

    fireEvent.click(screen.getByRole("button", { name: "تصدير PDF" }));
    expect(screen.getByRole("button", { name: "جارٍ تجهيز PDF…" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("يتم تجهيز التقرير كصورة للحفاظ على العرض العربي؛ لا تغلق الصفحة.")).toBeTruthy();
    finishExport?.({ filename: "حضور-تقرير-تحليل.pdf" });
    await waitFor(() => expect(screen.getByText(/اكتمل تجهيز PDF/)).toBeTruthy());
  });
});
