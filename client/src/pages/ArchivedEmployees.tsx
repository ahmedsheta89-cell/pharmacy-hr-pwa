import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { ArchiveRestore, RotateCcw, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

function formatDate(value?: Date | null) {
  return value ? new Intl.DateTimeFormat("ar-EG", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value)) : "—";
}

export default function ArchivedEmployees() {
  const branches = trpc.organization.listBranches.useQuery();
  const [branchId, setBranchId] = useState(0);
  const archived = trpc.employees.list.useQuery(branchId ? { branchId, status: "inactive", sortBy: "name", sortDirection: "asc" } : undefined, { enabled: Boolean(branchId) });
  const restore = trpc.employees.restore.useMutation({
    onSuccess: () => { toast.success("تمت استعادة ملف الموظف إلى القائمة النشطة."); archived.refetch(); },
    onError: error => toast.error(error.message || "تعذرت استعادة ملف الموظف. حاول مجدداً."),
  });

  useEffect(() => { if (!branchId && branches.data?.[0]) setBranchId(branches.data[0].id); }, [branchId, branches.data]);

  return <div dir="rtl" className="space-y-6">
    <section className="flex flex-col gap-5 rounded-[1.75rem] border border-[#dce9e2] bg-white p-6 shadow-[0_18px_42px_-34px_rgba(23,52,74,.45)] sm:flex-row sm:items-end sm:justify-between">
      <div><span className="rounded-full bg-[#fff4e5] px-3 py-1 text-xs font-bold text-[#a05a00]">حفظ السجل التشغيلي</span><h2 className="mt-3 text-2xl font-extrabold text-[#17344a]">الموظفون المؤرشفون</h2><p className="mt-2 text-sm leading-7 text-slate-500">استعرض الملفات المؤرشفة واستعدها إلى القائمة النشطة دون فقدان بياناتها أو تاريخ تعديلاتها.</p></div>
      <ArchiveRestore className="h-10 w-10 text-[#0f766e]" />
    </section>
    <label className="block max-w-sm"><span className="text-xs font-bold text-slate-600">الفرع</span><select value={branchId || ""} onChange={event => setBranchId(Number(event.target.value))} className="mt-1 h-10 w-full rounded-xl border border-[#d7e6df] bg-white px-3 text-sm text-[#17344a] outline-none focus:ring-2 focus:ring-[#0f766e]"><option value="" disabled>اختر الفرع</option>{branches.data?.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
    {archived.isLoading ? <Card><CardContent className="p-8 text-center text-sm font-bold text-[#0f766e]">جارٍ تحميل الملفات المؤرشفة…</CardContent></Card> : (archived.data?.length ?? 0) > 0 ? <Card className="border-[#e1ece6] bg-white"><CardContent className="divide-y divide-[#edf3ef] p-0">{archived.data?.map(employee => <div key={employee.id} className="flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="font-extrabold text-[#17344a]">{employee.fullName}</p><p className="mt-1 text-xs text-slate-500">{employee.jobTitle} · {employee.employeeCode} · تاريخ التعيين: {formatDate(employee.hireDate)}</p></div><Button size="sm" onClick={() => restore.mutate({ employeeId: employee.id })} disabled={restore.isPending} className="rounded-xl bg-[#0f766e] font-bold hover:bg-[#0b5c56]"><RotateCcw className="ml-1 h-3.5 w-3.5" />{restore.isPending ? "جارٍ الاستعادة…" : "استعادة"}</Button></div>)}</CardContent></Card> : <Card><CardContent className="grid min-h-52 place-items-center p-6 text-center"><div><UsersRound className="mx-auto h-8 w-8 text-[#0f766e]" /><h3 className="mt-3 font-extrabold text-[#17344a]">لا توجد ملفات مؤرشفة في هذا الفرع</h3><p className="mt-2 text-sm text-slate-500">ستظهر هنا الملفات المؤرشفة القابلة للاستعادة.</p></div></CardContent></Card>}
  </div>;
}
