import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, CircleAlert, RotateCcw, ShieldCheck, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";

const statusLabel: Record<string, string> = { draft: "مسودة", pending_manager: "بانتظار المدير", pending_hr: "بانتظار الموارد البشرية", approved: "معتمد", rejected: "مرفوض", paid: "مدفوع" };
const decisionLabel: Record<string, string> = { approved: "تمت الموافقة", rejected: "تم الرفض", returned: "أُعيد للتعديل" };

function formatDateTime(value?: Date | null) {
  return value ? new Intl.DateTimeFormat("ar-EG", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";
}

function ApprovalTimeline({ payrollRunId }: { payrollRunId: number }) {
  const history = trpc.payroll.approvalHistory.useQuery({ payrollRunId });
  if (history.isLoading) return <p className="mt-4 text-xs text-slate-400">جارٍ تحميل سجل القرارات…</p>;
  if (history.isError) return <p className="mt-4 text-xs text-rose-600">تعذر تحميل سجل القرارات.</p>;
  if (!history.data?.length) return <p className="mt-4 text-xs text-slate-500">لا توجد قرارات مسجلة بعد. سيظهر قرار المدير ثم الموارد البشرية هنا.</p>;
  return <ol className="mt-4 space-y-3 border-r-2 border-[#dce9e2] pr-4">
    {history.data.map(({ approval, approver }) => <li key={approval.id} className="relative rounded-xl bg-[#f8fcfa] p-3"><span className="absolute -right-[1.45rem] top-4 h-3 w-3 rounded-full border-2 border-white bg-[#0f766e]" /><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold text-[#17344a]">{approval.approvalStage === "manager" ? "قرار المدير المباشر" : approval.approvalStage === "hr_manager" ? "قرار الموارد البشرية" : "قرار المالك"}</p><Badge className={approval.decision === "approved" ? "bg-[#e6f5ef] text-[#0f766e]" : "bg-[#fff1f2] text-rose-700"}>{decisionLabel[approval.decision]}</Badge></div><p className="mt-1 text-xs text-slate-500">{approver?.fullName ?? "مستخدم مخوّل"} · {formatDateTime(approval.createdAt)}</p>{approval.note ? <p className="mt-2 rounded-lg border border-[#e1ece6] bg-white p-2 text-xs leading-5 text-slate-600">ملاحظة: {approval.note}</p> : null}</li>)}
  </ol>;
}

export default function PayrollApprovals() {
  const { user } = useAuth();
  const allowed = ["admin", "owner", "manager", "hr_manager"].includes(user?.role ?? "");
  const directManager = ["admin", "owner", "manager"].includes(user?.role ?? "");
  const humanResources = ["admin", "owner", "hr_manager"].includes(user?.role ?? "");
  const branches = trpc.organization.listBranches.useQuery(undefined, { enabled: allowed });
  const [branchId, setBranchId] = useState(0);
  const [notes, setNotes] = useState<Record<number, string>>({});
  useEffect(() => { if (!branchId && branches.data?.[0]) setBranchId(branches.data[0].id); }, [branchId, branches.data]);
  const runs = trpc.payroll.listRuns.useQuery({ branchId }, { enabled: allowed && branchId > 0 });
  const refresh = () => void runs.refetch();
  const managerReview = trpc.payroll.reviewByManager.useMutation({ onSuccess: () => { toast.success("تم تسجيل قرار المدير وتحديث مسار المسير."); refresh(); }, onError: error => toast.error(error.message) });
  const hrReview = trpc.payroll.reviewByHr.useMutation({ onSuccess: () => { toast.success("تم تسجيل قرار الموارد البشرية وتحديث مسار المسير."); refresh(); }, onError: error => toast.error(error.message) });
  const decisionAction = (runId: number, stage: "manager" | "hr_manager", decision: "approved" | "rejected" | "returned") => {
    const payload = { payrollRunId: runId, decision, note: notes[runId]?.trim() || undefined };
    if (stage === "manager") managerReview.mutate(payload); else hrReview.mutate(payload);
  };

  if (!allowed) return <div dir="rtl" className="rounded-3xl border border-[#dce9e2] bg-white p-8 text-center text-sm text-slate-600">سجل اعتماد الرواتب متاح للمالك والمدير ومدير الموارد البشرية فقط.</div>;

  return <div dir="rtl" className="space-y-6">
    <section className="flex flex-col gap-4 rounded-[1.75rem] border border-[#dce9e2] bg-white p-6 shadow-[0_18px_42px_-34px_rgba(23,52,74,.45)] lg:flex-row lg:items-end lg:justify-between"><div><p className="text-sm font-bold text-[#0f766e]">حوكمة الاستحقاقات</p><h1 className="mt-1 text-3xl font-black tracking-tight text-[#17344a]">سجل اعتماد الرواتب</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">تتبّع القرار وصاحبه ووقته وملاحظته لكل مسير، مع انتقال واضح بين المدير المباشر والموارد البشرية.</p></div><label className="w-full lg:w-56"><span className="mb-1 block text-xs font-bold text-slate-600">الفرع</span><select value={branchId || ""} onChange={event => setBranchId(Number(event.target.value))} className="h-10 w-full rounded-xl border border-[#d7e6df] bg-white px-3 text-sm text-[#17344a] outline-none focus:ring-2 focus:ring-[#0f766e]"><option value="" disabled>اختر الفرع</option>{branches.data?.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label></section>
    <Card className="border-amber-200 bg-amber-50"><CardContent className="flex gap-3 p-4 text-sm leading-6 text-amber-900"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0" /><p><strong>قنوات الإرسال غير مهيّأة:</strong> لا يُرسل التطبيق أي كشف راتب عبر البريد أو واتساب حالياً. يمكن تصدير الملفات من صفحة الرواتب، ويظل الربط الخارجي مؤجلاً لحين اختيار مزود آمن.</p></CardContent></Card>
    {runs.isLoading ? <div className="grid min-h-64 place-items-center rounded-3xl bg-white text-sm font-bold text-[#0f766e]">جارٍ تحميل المسيرات…</div> : null}
    {runs.isError ? <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">تعذر تحميل مسيرات الرواتب لهذا الفرع. حاول مرة أخرى.</div> : null}
    {(runs.data ?? []).map(run => <Card key={run.id} className="border-[#e1ece6] bg-white"><CardHeader className="pb-2"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="text-lg text-[#17344a]">مسير رواتب {run.month}/{run.year}</CardTitle><p className="mt-1 text-xs text-slate-500">أنشئ في {formatDateTime(run.createdAt)}</p></div><Badge className={run.status === "approved" || run.status === "paid" ? "bg-[#e6f5ef] text-[#0f766e]" : run.status === "rejected" ? "bg-[#fff1f2] text-rose-700" : "bg-[#fff3db] text-[#b87516]"}>{statusLabel[run.status]}</Badge></div></CardHeader><CardContent><ApprovalTimeline payrollRunId={run.id} />
      {(directManager && run.status === "pending_manager") || (humanResources && run.status === "pending_hr") ? <div className="mt-5 rounded-2xl border border-[#dce9e2] bg-[#fbfdfc] p-4"><div className="flex items-center gap-2 text-sm font-bold text-[#17344a]">{run.status === "pending_manager" ? <UserRoundCheck className="h-4 w-4 text-[#0f766e]" /> : <ShieldCheck className="h-4 w-4 text-[#0f766e]" />}{run.status === "pending_manager" ? "قرار المدير المباشر" : "قرار مدير الموارد البشرية"}</div><Textarea value={notes[run.id] ?? ""} onChange={event => setNotes(current => ({ ...current, [run.id]: event.target.value }))} maxLength={1000} placeholder="أضف ملاحظة القرار (اختياري)" className="mt-3 min-h-20 border-[#d7e6df] bg-white" /><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" disabled={managerReview.isPending || hrReview.isPending} onClick={() => decisionAction(run.id, run.status === "pending_manager" ? "manager" : "hr_manager", "approved")} className="bg-[#0f766e] hover:bg-[#0b5c56]"><CheckCircle2 className="ml-1 h-3.5 w-3.5" />اعتماد</Button><Button size="sm" variant="outline" disabled={managerReview.isPending || hrReview.isPending} onClick={() => decisionAction(run.id, run.status === "pending_manager" ? "manager" : "hr_manager", "returned")} className="border-amber-300 text-amber-800 hover:bg-amber-50"><RotateCcw className="ml-1 h-3.5 w-3.5" />إعادة للتعديل</Button><Button size="sm" variant="outline" disabled={managerReview.isPending || hrReview.isPending} onClick={() => decisionAction(run.id, run.status === "pending_manager" ? "manager" : "hr_manager", "rejected")} className="border-rose-200 text-rose-700 hover:bg-rose-50">رفض</Button></div></div> : null}
    </CardContent></Card>)}
    {!runs.isLoading && !runs.isError && !(runs.data ?? []).length ? <Card className="border-[#e1ece6] bg-white"><CardContent className="p-8 text-center text-sm text-slate-500">لا توجد مسيرات لهذا الفرع بعد. أنشئ مسيراً من وحدة الرواتب ثم أرسله لمسار الاعتماد.</CardContent></Card> : null}
  </div>;
}
