import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { ClipboardList, History } from "lucide-react";
import { useEffect, useState } from "react";

const actionLabels: Record<string, string> = { created: "إنشاء الملف", updated: "تعديل البيانات", archived: "أرشفة الملف", restored: "استعادة الملف" };
function formatDateTime(value?: Date | null) { return value ? new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—"; }

export default function EmployeeAuditLog() {
  const branches = trpc.organization.listBranches.useQuery();
  const [branchId, setBranchId] = useState(0);
  const [employeeId, setEmployeeId] = useState(0);
  const employees = trpc.employees.list.useQuery(branchId ? { branchId, includeArchived: true, sortBy: "name", sortDirection: "asc" } : undefined, { enabled: Boolean(branchId) });
  const audit = trpc.employees.auditLog.useQuery({ employeeId }, { enabled: Boolean(employeeId) });
  useEffect(() => { if (!branchId && branches.data?.[0]) setBranchId(branches.data[0].id); }, [branchId, branches.data]);
  useEffect(() => { if (!employeeId && employees.data?.[0]) setEmployeeId(employees.data[0].id); }, [employeeId, employees.data]);
  const changesFor = (row: unknown) => Array.isArray(row) ? row as Array<{ label?: string; before?: string; after?: string }> : [];

  return <div dir="rtl" className="space-y-6">
    <section className="flex items-end justify-between gap-4 rounded-[1.75rem] border border-[#dce9e2] bg-white p-6 shadow-[0_18px_42px_-34px_rgba(23,52,74,.45)]"><div><span className="rounded-full bg-[#e6f5ef] px-3 py-1 text-xs font-bold text-[#0f766e]">شفافية السجل</span><h2 className="mt-3 text-2xl font-extrabold text-[#17344a]">سجل تعديلات الموظفين</h2><p className="mt-2 text-sm leading-7 text-slate-500">كل تعديل وأرشفة واستعادة يُسجل باسم المنفذ وتوقيته والحقول المتغيرة.</p></div><History className="h-10 w-10 text-[#0f766e]" /></section>
    <div className="grid gap-4 md:grid-cols-2"><label><span className="text-xs font-bold text-slate-600">الفرع</span><select value={branchId || ""} onChange={event => { setBranchId(Number(event.target.value)); setEmployeeId(0); }} className="mt-1 h-10 w-full rounded-xl border border-[#d7e6df] bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[#0f766e]"><option value="" disabled>اختر الفرع</option>{branches.data?.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label><span className="text-xs font-bold text-slate-600">الموظف</span><select value={employeeId || ""} onChange={event => setEmployeeId(Number(event.target.value))} className="mt-1 h-10 w-full rounded-xl border border-[#d7e6df] bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[#0f766e]"><option value="" disabled>اختر الموظف</option>{employees.data?.map(employee => <option key={employee.id} value={employee.id}>{employee.fullName} — {employee.employeeCode}</option>)}</select></label></div>
    {audit.isLoading ? <Card><CardContent className="p-8 text-center text-sm font-bold text-[#0f766e]">جارٍ تحميل سجل التعديلات…</CardContent></Card> : (audit.data?.length ?? 0) > 0 ? <div className="space-y-3">{audit.data?.map(log => <Card key={log.id} className="border-[#e1ece6] bg-white"><CardContent className="p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-extrabold text-[#17344a]">{actionLabels[log.action] || log.action}</p><p className="mt-1 text-xs text-slate-500">بواسطة {log.actorName || "مستخدم النظام"} · {formatDateTime(log.createdAt)}</p></div><ClipboardList className="h-5 w-5 text-[#0f766e]" /></div>{changesFor(log.changes).length ? <div className="mt-4 divide-y divide-[#edf3ef] rounded-xl bg-[#f8fcfa] px-4">{changesFor(log.changes).map((change, index) => <div key={`${change.label}-${index}`} className="grid gap-1 py-3 text-sm md:grid-cols-[150px_1fr_1fr]"><span className="font-bold text-[#17344a]">{change.label || "حقل"}</span><span className="text-slate-500">السابق: {change.before || "—"}</span><span className="text-[#0f766e]">الجديد: {change.after || "—"}</span></div>)}</div> : null}</CardContent></Card>)}</div> : <Card><CardContent className="grid min-h-52 place-items-center p-6 text-center"><div><ClipboardList className="mx-auto h-8 w-8 text-[#0f766e]" /><h3 className="mt-3 font-extrabold text-[#17344a]">لا توجد تعديلات مسجلة بعد</h3><p className="mt-2 text-sm text-slate-500">اختر موظفاً؛ وستظهر التعديلات الجديدة هنا بمجرد حفظها.</p></div></CardContent></Card>}
  </div>;
}
