// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArchiveEmployeeDialog } from "./ArchiveEmployeeDialog";
import { BranchForm } from "./BranchForm";
import { EmployeeForm } from "./EmployeeForm";

afterEach(cleanup);

describe("نماذج الموظف والفرع عند فشل الحفظ", () => {
  it("يعرض تنبيه التحقق العربي للفرع ويُبقي زر الحفظ قابلاً للاستخدام", () => {
    render(<BranchForm submitting={false} onSubmit={vi.fn()} />);
    fireEvent.submit(screen.getByRole("button", { name: "حفظ الفرع" }).closest("form")!);
    expect(screen.getByRole("alert").textContent).toContain("أدخل اسم الفرع أولاً.");
    expect((screen.getByRole("button", { name: "حفظ الفرع" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("يعرض خطأ الخادم للموظف ويُنهي حالة الانتظار", () => {
    render(<EmployeeForm submitting={false} error="تعذر حفظ بيانات الموظف. حاول مجدداً." onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).toContain("تعذر حفظ بيانات الموظف");
    expect((screen.getByRole("button", { name: "إنشاء الملف" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("يعرض تنبيه المهلة داخل نموذج الموظف ويعيد زر الحفظ لحالته الطبيعية", () => {
    render(<EmployeeForm submitting={false} error="انتهت مهلة الحفظ. تحقق من الاتصال ثم حاول مجدداً." onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).toContain("انتهت مهلة الحفظ");
    expect((screen.getByRole("button", { name: "إنشاء الملف" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("يعرض فشل الأرشفة ولا يترك إجراء التأكيد معطلاً", () => {
    render(<ArchiveEmployeeDialog employee={{ id: 8, fullName: "موظف تجريبي" }} pending={false} error="انتهت مهلة الحفظ. حاول مجدداً." onArchive={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).toContain("انتهت مهلة الحفظ");
    expect((screen.getByRole("button", { name: "تأكيد الأرشفة" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
