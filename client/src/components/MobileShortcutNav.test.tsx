// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileShortcutNav } from "./DashboardLayout";

afterEach(cleanup);

describe("شارات شريط اختصارات الهاتف", () => {
  it("يعرض رسائل ومهام المالك على الاختصارات الصحيحة", () => {
    render(<MobileShortcutNav role="owner" location="/" onNavigate={vi.fn()} unreadNotifications={3} taskBadges={{ accountLinks: 2, leaves: 4, payroll: 1 }} />);

    expect(screen.getByRole("button", { name: "الرئيسية، 5 إشعارات أو مهام جديدة" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "الإجازات، 4 مهام معلقة" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "الرواتب، 1 مهام معلقة" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "الورديات" })).toBeTruthy();
  });

  it("لا يعرض اختصار الرواتب أو شارات مهام إدارية للموظف", () => {
    render(<MobileShortcutNav role="employee" location="/attendance" onNavigate={vi.fn()} unreadNotifications={0} taskBadges={{ accountLinks: 0, leaves: 0, payroll: 0 }} />);

    expect(screen.queryByRole("button", { name: /الرواتب/ })).toBeNull();
    expect(screen.getByRole("button", { name: "الإجازات" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "الحضور والانصراف" })).toBeTruthy();
  });
});
