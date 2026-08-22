// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  linkHistoryInput: [] as unknown[],
  linkHistory: { data: [] as unknown[], isLoading: false, isError: false, refetch: vi.fn() },
  user: { id: 1, role: "owner", name: "مالك الاختبار" },
  employees: [] as unknown[],
  unlinkedUsers: [] as unknown[],
  pendingRequests: [] as unknown[],
  requestOptions: null as any,
  reviewOptions: null as any,
  requestMutate: vi.fn(),
  reviewMutate: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
  mutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("../_core/hooks/useAuth", () => ({ useAuth: () => ({ user: testState.user }) }));
vi.mock("sonner", () => ({ toast: testState.toast }));
vi.mock("../lib/trpc", () => ({
  trpc: {
    organization: { listBranches: { useQuery: () => ({ data: [], refetch: vi.fn() }) }, createBranch: { useMutation: testState.mutation } },
    profile: { unlinkedUsers: { useQuery: () => ({ data: testState.unlinkedUsers, refetch: vi.fn() }) } },
    employees: {
      list: { useQuery: () => ({ data: testState.employees, refetch: vi.fn() }) },
      pendingLinkRequests: { useQuery: () => ({ data: testState.pendingRequests, refetch: vi.fn() }) },
      linkHistory: { useQuery: (input: unknown) => { testState.linkHistoryInput.push(input); return testState.linkHistory; } },
      create: { useMutation: testState.mutation }, update: { useMutation: testState.mutation }, archive: { useMutation: testState.mutation },
      linkUser: { useMutation: testState.mutation }, requestUserLink: { useMutation: (options: any) => { testState.requestOptions = options; return { mutate: testState.requestMutate, isPending: false }; } }, unlinkUser: { useMutation: testState.mutation }, reviewLinkRequest: { useMutation: (options: any) => { testState.reviewOptions = options; return { mutate: (variables: unknown) => { testState.reviewMutate(variables); options.onMutate?.(variables); }, isPending: false }; } },
    },
    certificates: { listForEmployee: { useQuery: () => ({ data: [] }) }, create: { useMutation: testState.mutation } },
  },
}));

import { EmployeesModule, LinkFeedbackNotice } from "./ModulePage";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
beforeEach(() => {
  testState.linkHistoryInput.length = 0;
  testState.linkHistory = { data: [], isLoading: false, isError: false, refetch: vi.fn() };
  testState.user = { id: 1, role: "owner", name: "مالك الاختبار" };
  testState.employees = [];
  testState.unlinkedUsers = [];
  testState.pendingRequests = [];
  testState.requestOptions = null;
  testState.reviewOptions = null;
  testState.requestMutate.mockReset();
  testState.reviewMutate.mockReset();
  testState.toast.success.mockReset(); testState.toast.error.mockReset(); testState.toast.message.mockReset();
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
});

describe("سجل ربط الحسابات", () => {
  it("يمرر عبارة البحث والفرع إلى الاستعلام ويعرض الحالة الفارغة بوضوح", () => {
    render(<EmployeesModule activeBranchId={1} setActiveBranchId={vi.fn()} />);
    expect(screen.getByText("لا توجد عمليات تطابق الفلاتر الحالية ضمن نطاقك الإداري.")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("الاسم أو البريد أو الكود"), { target: { value: "سارة" } });
    expect(testState.linkHistoryInput.at(-1)).toMatchObject({ branchId: 1, search: "سارة" });
  });

  it("يعرض رسالة خطأ مستقلة ويعيد تشغيل الاستعلام عند طلب المستخدم", () => {
    testState.linkHistory = { data: [], isLoading: false, isError: true, refetch: vi.fn() };
    render(<EmployeesModule activeBranchId={1} setActiveBranchId={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).toContain("تعذر تحميل سجل الربط");
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    expect(testState.linkHistory.refetch).toHaveBeenCalledOnce();
  });

  it("ينزّل النتائج الظاهرة والمصرح بها كملف XLSX عند التصدير", () => {
    testState.linkHistory = { data: [{ employeeName: "سارة أحمد", employeeCode: "EMP-07", accountName: "سارة", accountEmail: "sara@example.test", log: { id: 1, userId: 4, action: "linked", source: "owner_direct", actorName: "المالك", createdAt: new Date("2026-08-22T09:00:00Z") } }], isLoading: false, isError: false, refetch: vi.fn() };
    render(<EmployeesModule activeBranchId={1} setActiveBranchId={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "تصدير Excel" }));
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
  });
});

describe("رسائل حالة ربط الحساب", () => {
  it("يعرض حالة تحميل متحركة ورسالة نجاح وحالة رفض منفصلة عن النجاح", () => {
    const { rerender } = render(<LinkFeedbackNotice feedback={{ tone: "loading", title: "جارٍ إرسال طلب الربط", description: "انتظر" }} />);
    expect(screen.getByRole("status").className).toContain("motion-safe:animate-in");
    expect(screen.getByText("جارٍ إرسال طلب الربط")).toBeTruthy();
    rerender(<LinkFeedbackNotice feedback={{ tone: "success", title: "تم اعتماد الطلب وربط الحساب", description: "نجح" }} />);
    expect(screen.getByRole("status").className).toContain("text-[#0f766e]");
    rerender(<LinkFeedbackNotice feedback={{ tone: "rejected", title: "تم رفض طلب الربط", description: "لم يُربط الحساب" }} />);
    expect(screen.getByRole("status").className).toContain("text-red-800");
  });

  it("ينتقل بطلب المدير من التحميل إلى انتظار اعتماد المالك ويظهر تأكيداً نهائياً", async () => {
    testState.user = { id: 2, role: "manager", name: "مدير الاختبار" };
    testState.employees = [{ id: 11, fullName: "سارة أحمد", jobTitle: "صيدلاني", employeeCode: "EMP-11", userId: null, role: "pharmacist" }];
    testState.unlinkedUsers = [{ id: 55, name: "حساب سارة", email: "sara@example.test", role: "employee" }];
    render(<EmployeesModule activeBranchId={1} setActiveBranchId={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "طلب ربط" }));
    fireEvent.change(screen.getByLabelText("حساب مستخدم غير مرتبط"), { target: { value: "55" } });
    fireEvent.click(screen.getByRole("button", { name: "إرسال طلب الربط" }));
    expect(testState.requestMutate).toHaveBeenCalledWith({ employeeId: 11, userId: 55 });
    expect(screen.getByRole("status").textContent).toContain("جارٍ إرسال طلب الربط");
    await act(async () => { await testState.requestOptions.onSuccess({ existing: false }); });
    expect(screen.getByRole("status").textContent).toContain("تم إرسال طلب الربط للمالك");
    expect(testState.toast.success).toHaveBeenCalledWith("تم إرسال طلب الربط للمالك");
  });

  it("ينتقل قرار رفض المالك من التحميل إلى رسالة رفض مستقلة وtoast محايد", async () => {
    testState.pendingRequests = [{ request: { id: 42, userId: 55, requestedByUserId: 2, createdAt: new Date("2026-08-22T09:00:00Z") }, employeeName: "سارة أحمد", accountName: "حساب سارة", accountEmail: "sara@example.test", requestedByName: "مدير الاختبار" }];
    render(<EmployeesModule activeBranchId={1} setActiveBranchId={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "رفض" }));
    expect(testState.reviewMutate).toHaveBeenCalledWith({ requestId: 42, decision: "rejected" });
    expect(screen.getByRole("status").textContent).toContain("جارٍ رفض طلب الربط");
    await act(async () => { await testState.reviewOptions.onSuccess({ status: "rejected" }); });
    expect(screen.getByRole("status").textContent).toContain("تم رفض طلب الربط");
    expect(testState.toast.message).toHaveBeenCalledWith("تم رفض طلب الربط");
  });
});
