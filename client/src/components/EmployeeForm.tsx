import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type EmployeeFormValues = {
  employeeCode: string;
  fullName: string;
  phone?: string;
  email?: string;
  jobTitle: string;
  role: "manager" | "hr_manager" | "pharmacist" | "employee";
  hireDate: Date;
  nationalId?: string;
};

export type EditableEmployee = {
  id: number;
  employeeCode: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  jobTitle: string;
  role: string;
  hireDate: Date;
  nationalId: string | null;
};

const fieldClass = "mt-1 h-10 rounded-xl border-[#d7e6df] bg-white text-[#17344a] focus-visible:ring-[#0f766e]";
const selectClass = "mt-1 h-10 w-full rounded-xl border border-[#d7e6df] bg-white px-3 text-sm text-[#17344a] outline-none focus:ring-2 focus:ring-[#0f766e]";

function toInputDate(value: Date) {
  return new Date(value).toISOString().slice(0, 10);
}

export function EmployeeForm({ employee, error, submitting, onSubmit, onCancel }: { employee?: EditableEmployee | null; error?: string | null; submitting: boolean; onSubmit: (values: EmployeeFormValues) => void; onCancel: () => void }) {
  const selectedRole = employee?.role === "manager" || employee?.role === "hr_manager" || employee?.role === "pharmacist" || employee?.role === "employee" ? employee.role : "employee";
  return <form noValidate onSubmit={event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const hireDate = String(data.get("hireDate") || "");
    if (!hireDate) return;
    onSubmit({
      employeeCode: String(data.get("employeeCode") || "").trim(),
      fullName: String(data.get("fullName") || "").trim(),
      phone: String(data.get("phone") || "").trim() || undefined,
      email: String(data.get("email") || "").trim() || undefined,
      jobTitle: String(data.get("jobTitle") || "").trim(),
      role: String(data.get("role")) as EmployeeFormValues["role"],
      hireDate: new Date(hireDate),
      nationalId: String(data.get("nationalId") || "").trim() || undefined,
    });
  }} className="grid gap-3 md:grid-cols-3">
    <label><span className="text-xs font-bold">الاسم الكامل</span><Input name="fullName" required defaultValue={employee?.fullName ?? ""} className={fieldClass} /></label>
    <label><span className="text-xs font-bold">الكود الوظيفي</span><Input name="employeeCode" required defaultValue={employee?.employeeCode ?? ""} className={fieldClass} /></label>
    <label><span className="text-xs font-bold">المسمى الوظيفي</span><Input name="jobTitle" required defaultValue={employee?.jobTitle ?? ""} placeholder="صيدلاني" className={fieldClass} /></label>
    <label><span className="text-xs font-bold">الدور</span><select name="role" className={selectClass} defaultValue={selectedRole}><option value="employee">موظف</option><option value="pharmacist">صيدلاني</option><option value="manager">مدير فرع</option><option value="hr_manager">مدير موارد بشرية</option></select></label>
    <label><span className="text-xs font-bold">تاريخ التعيين</span><Input name="hireDate" type="date" defaultValue={employee ? toInputDate(employee.hireDate) : toInputDate(new Date())} required className={fieldClass} /></label>
    <label><span className="text-xs font-bold">الهاتف</span><Input name="phone" defaultValue={employee?.phone ?? ""} className={fieldClass} /></label>
    <label><span className="text-xs font-bold">البريد الإلكتروني</span><Input name="email" type="email" defaultValue={employee?.email ?? ""} className={fieldClass} /></label>
    <label><span className="text-xs font-bold">الرقم القومي</span><Input name="nationalId" defaultValue={employee?.nationalId ?? ""} className={fieldClass} /></label>
    {error ? <p role="alert" className="md:col-span-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p> : null}
    <div className="flex items-end gap-2 md:col-span-3"><Button disabled={submitting}>{submitting ? "جارٍ الحفظ..." : employee ? "حفظ التعديلات" : "إنشاء الملف"}</Button>{employee ? <Button type="button" variant="outline" onClick={onCancel}>إلغاء</Button> : null}</div>
  </form>;
}
