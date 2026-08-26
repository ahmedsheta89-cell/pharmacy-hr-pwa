import { useMemo, useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, CircleAlert, ClipboardCheck, Send, ShieldCheck, UsersRound } from "lucide-react";
import { toast } from "sonner";

const canSubmit = (role?: string) => ["admin", "owner", "manager"].includes(role ?? "");
const statusLabel: Record<string, string> = { draft: "مسودة", pending_manager: "بانتظار المدير", pending_hr: "بانتظار الموارد البشرية", approved: "معتمد", rejected: "مرفوض", paid: "مدفوع" };

export function PayrollReadinessCenter({ activeBranchId, role }: { activeBranchId: number; role?: string }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [selected, setSelected] = useState<number[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const utils = trpc.useUtils();
  const enabled = Boolean(activeBranchId);
  const readiness = trpc.payroll.readiness.useQuery({ branchId: activeBranchId || 1, year, month }, { enabled, staleTime: 20_000 });
  const runs = trpc.payroll.listRuns.useQuery({ branchId: activeBranchId || 1 }, { enabled, staleTime: 20_000 });
  const eligibleRuns = useMemo(() => (runs.data ?? []).filter(run => run.status === "draft" || run.status === "rejected"), [runs.data]);
  const submit = trpc.payroll.submitBatchForApproval.useMutation({
    onSuccess: data => {
      toast.success(`تم إرسال ${data.submittedCount} مسير لاعتماد المدير.`);
      setSelected([]);
      setConfirmOpen(false);
      utils.payroll.listRuns.invalidate();
      utils.payroll.readiness.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const toggleRun = (id: number, checked: boolean) => setSelected(current => checked ? [...current, id] : current.filter(item => item !== id));

  return <section className="space-y-4" dir="rtl">
    <Card className="overflow-hidden border-[#cce3d8] bg-[linear-gradient(120deg,#f6fcf9_0%,#eef7f3_52%,#e3f3ed_100%)]">
      <CardContent className="p-5 sm:p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div className="max-w-2xl"><div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#0f766e] text-white"><ClipboardCheck className="h-5 w-5" /></span><div><p className="text-xs font-bold text-[#0f766e]">بوابة قرار الرواتب</p><h3 className="text-lg font-extrabold text-[#17344a]">جاهزية قابلة للمراجعة قبل الاعتماد</h3></div></div><p className="mt-3 text-xs leading-6 text-slate-600">تُظهر هذه البوابة النواقص والمراجعات المطلوبة وتسمح فقط بإحالة مسيرات موجودة مسبقاً إلى اعتماد المدير. لا تنشئ خصماً أو بند راتب أو عملية صرف.</p></div><div className="grid grid-cols-2 gap-2 sm:flex"><label className="text-xs font-bold text-slate-600">السنة<Input className="mt-1 h-10 w-full bg-white sm:w-24" type="number" min="2024" max="2100" value={year} onChange={event => setYear(Number(event.target.value))} /></label><label className="text-xs font-bold text-slate-600">الشهر<Input className="mt-1 h-10 w-full bg-white sm:w-20" type="number" min="1" max="12" value={month} onChange={event => setMonth(Number(event.target.value))} /></label></div></div></CardContent>
    </Card>

    {readiness.isLoading ? <Card><CardContent className="p-5 text-sm text-slate-500">جارٍ فحص جاهزية الفترة…</CardContent></Card> : null}
    {readiness.isError ? <Card className="border-rose-200 bg-rose-50"><CardContent className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm text-rose-800"><span>تعذر فحص جاهزية الرواتب للفترة المختارة.</span><Button size="sm" variant="outline" onClick={() => readiness.refetch()} className="border-rose-200 bg-white text-rose-700">إعادة المحاولة</Button></CardContent></Card> : null}
    {readiness.data ? <><div className="grid gap-3 sm:grid-cols-3"><Metric icon={UsersRound} label="الفريق النشط" value={readiness.data.totalEmployees} tone="slate" /><Metric icon={CheckCircle2} label="جاهز للمراجعة" value={readiness.data.readyEmployees} tone="green" /><Metric icon={CircleAlert} label="يتطلب تدخلاً" value={readiness.data.needsReviewEmployees + readiness.data.pendingAdjustments} tone="amber" /></div><div className="grid gap-4 xl:grid-cols-[1.45fr_.85fr]"><Card className="border-[#e1ece6] bg-white"><CardContent className="p-5"><div className="flex items-center justify-between gap-3"><div><h4 className="font-extrabold text-[#17344a]">قائمة جاهزية الفريق</h4><p className="mt-1 text-xs text-slate-500">الفترة {month}/{year} وفق هياكل الرواتب السارية والتعديلات المعلقة.</p></div><Badge className="bg-[#e6f5ef] text-[#0f766e] hover:bg-[#e6f5ef]">{readiness.data.readyEmployees}/{readiness.data.totalEmployees} جاهزون</Badge></div><div className="mt-4 divide-y divide-[#edf3ef]">{readiness.data.employees.map(employee => <div key={employee.employeeId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold text-[#17344a]">{employee.fullName} <span className="font-medium text-slate-400">· {employee.employeeCode}</span></p><p className="mt-1 text-xs text-slate-500">{employee.hasSalaryStructure ? "هيكل راتب ساري" : "لا يوجد هيكل راتب ساري"}{employee.pendingAdjustments ? ` · ${employee.pendingAdjustments} تعديل بانتظار المراجعة` : ""}</p></div><Badge className={employee.status === "ready" ? "bg-[#e6f5ef] text-[#0f766e] hover:bg-[#e6f5ef]" : "bg-amber-50 text-amber-800 hover:bg-amber-50"}>{employee.status === "ready" ? "جاهز" : "مراجعة مطلوبة"}</Badge></div>)}{!readiness.data.employees.length ? <p className="py-8 text-center text-sm text-slate-500">لا يوجد موظفون نشطون ضمن هذا الفرع.</p> : null}</div></CardContent></Card><Card className="border-[#e1ece6] bg-white"><CardContent className="p-5"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#0f766e]" /><h4 className="font-extrabold text-[#17344a]">حالة المسير</h4></div>{readiness.data.existingRun ? <div className="mt-4 rounded-2xl bg-[#f8fcfa] p-4"><p className="text-sm font-extrabold text-[#17344a]">مسير {readiness.data.existingRun.month}/{readiness.data.existingRun.year}</p><p className="mt-1 text-xs text-slate-500">تم إنشاؤه في {new Date(readiness.data.existingRun.createdAt).toLocaleDateString("ar-EG")}</p><Badge className="mt-3 bg-[#e6f5ef] text-[#0f766e] hover:bg-[#e6f5ef]">{statusLabel[readiness.data.existingRun.status]}</Badge></div> : <div className="mt-4 rounded-2xl border border-dashed border-[#d7e6df] p-4 text-sm text-slate-500">لا يوجد مسير منشأ للفترة. عالج النواقص أولاً ثم أنشئ المسير من تدفق الرواتب المعتاد.</div>}</CardContent></Card></div></> : null}

    {canSubmit(role) && eligibleRuns.length ? <Card className="border-[#dce9e2] bg-white"><CardContent className="p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h4 className="font-extrabold text-[#17344a]">إحالة جماعية لاعتماد المدير</h4><p className="mt-1 text-xs leading-5 text-slate-500">اختر المسيرات المسودة أو المعادة فقط. ستنتقل إلى حالة «بانتظار المدير» مع الاحتفاظ بسجل الاعتماد اللاحق.</p></div><Button disabled={!selected.length || submit.isPending} onClick={() => setConfirmOpen(true)} className="bg-[#0f766e] hover:bg-[#0b5c56]"><Send className="ml-1 h-4 w-4" />إرسال المحدد ({selected.length})</Button></div><div className="mt-4 grid gap-2 md:grid-cols-2">{eligibleRuns.map(run => <label key={run.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#e1ece6] p-3"><Checkbox checked={selected.includes(run.id)} onCheckedChange={checked => toggleRun(run.id, checked === true)} /><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-[#17344a]">مسير {run.month}/{run.year}</span><span className="mt-1 block text-xs text-slate-500">{statusLabel[run.status]}</span></span></label>)}</div></CardContent></Card> : null}
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}><AlertDialogContent dir="rtl"><AlertDialogHeader><AlertDialogTitle>تأكيد إحالة المسيرات للاعتماد</AlertDialogTitle><AlertDialogDescription>سيتم إرسال {selected.length} مسير موجود إلى مرحلة اعتماد المدير فقط. لن تُنشأ أي بنود أو خصومات أو دفعات جديدة.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={submit.isPending}>إلغاء</AlertDialogCancel><AlertDialogAction disabled={submit.isPending} onClick={() => submit.mutate({ branchId: activeBranchId, payrollRunIds: selected })} className="bg-[#0f766e] hover:bg-[#0b5c56]">{submit.isPending ? "جارٍ الإحالة…" : "تأكيد الإحالة"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof UsersRound; label: string; value: number; tone: "slate" | "green" | "amber" }) {
  const styles = { slate: "border-slate-200 bg-white text-[#17344a]", green: "border-emerald-100 bg-emerald-50 text-emerald-800", amber: "border-amber-100 bg-amber-50 text-amber-800" }[tone];
  return <Card className={styles}><CardContent className="flex items-center justify-between p-4"><div><p className="text-xs font-bold opacity-75">{label}</p><p className="mt-1 text-2xl font-extrabold">{value}</p></div><Icon className="h-5 w-5 opacity-70" /></CardContent></Card>;
}
