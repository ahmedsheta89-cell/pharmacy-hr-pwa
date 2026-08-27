import { useAuth } from "@/_core/hooks/useAuth";
import { AttendanceImportPanel } from "@/components/AttendanceImportPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { downloadExcelWorkbook, mapAttendanceReportToExcelRows } from "@/lib/excel-export";
import { parseAttendanceFile, type AttendanceImportDraft, type AttendanceImportProgress } from "@/lib/attendance-import";
import { defaultAttendanceImportAnalysisSettings, type AttendanceImportAnalysisSettings } from "@/lib/attendance-import-analysis";
import { trpc } from "@/lib/trpc";
import { CalendarCheck2, CheckCircle2, Clock3, FileDown, Sparkles } from "lucide-react";
import React, { useMemo, useState } from "react";
import { toast } from "sonner";

function isManagerRole(role?: string) {
  return role === "admin" || role === "owner" || role === "manager";
}

function isOwnerRole(role?: string) {
  return role === "admin" || role === "owner";
}

function toInputDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function formatTime(value?: Date | null) {
  return value ? new Intl.DateTimeFormat("ar-EG", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";
}

export function EnhancedAttendanceModule({ activeBranchId = 0, setActiveBranchId = () => undefined }: { activeBranchId?: number; setActiveBranchId?: (value: number) => void }) {
  const { user } = useAuth();
  const manager = isManagerRole(user?.role);
  const owner = isOwnerRole(user?.role);
  const profileQuery = trpc.profile.mine.useQuery();
  const branchesQuery = trpc.organization.listBranches.useQuery();
  const [setupBranchId, setSetupBranchId] = useState(0);
  const [draft, setDraft] = useState<AttendanceImportDraft | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<AttendanceImportProgress | null>(null);
  const [analysisSettings, setAnalysisSettings] = useState<AttendanceImportAnalysisSettings | undefined>();
  const [reportFrom, setReportFrom] = useState(() => toInputDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [reportTo, setReportTo] = useState(() => toInputDate(new Date()));
  const hasEmployeeProfile = Boolean(profileQuery.data?.employee);
  const reportInput = useMemo(() => ({ branchId: activeBranchId || 1, from: new Date(`${reportFrom}T00:00:00`), to: new Date(`${reportTo}T00:00:00`) }), [activeBranchId, reportFrom, reportTo]);
  const attendanceQuery = trpc.attendance.mineToday.useQuery(undefined, { enabled: hasEmployeeProfile });
  const branchReport = trpc.attendance.branchReport.useQuery(reportInput, { enabled: manager && activeBranchId > 0 && Boolean(reportFrom && reportTo) });
  const importHistory = trpc.attendance.importHistory.useQuery({ branchId: activeBranchId || 1 }, { enabled: manager && activeBranchId > 0 });
  const checkIn = trpc.attendance.checkIn.useMutation({ onSuccess: result => { toast.success(result.lateMinutes ? `تم تسجيل الحضور مع تأخير ${result.lateMinutes} دقيقة.` : "تم تسجيل الحضور في الموعد."); attendanceQuery.refetch(); }, onError: error => toast.error(error.message) });
  const checkOut = trpc.attendance.checkOut.useMutation({ onSuccess: result => { toast.success(`تم تسجيل الانصراف. ساعات العمل المسجلة: ${Math.floor(result.workedMinutes / 60)} س ${result.workedMinutes % 60} د.`); attendanceQuery.refetch(); }, onError: error => toast.error(error.message) });
  const setupProfile = trpc.profile.setupEmployeeProfile.useMutation({ onSuccess: async result => { await profileQuery.refetch(); toast.success(result.existing ? "ملفك الوظيفي مرتبط بالفعل بحسابك." : "تم إنشاء ملفك الوظيفي وربطه بحسابك."); }, onError: error => toast.error(error.message) });
  const importRecords = trpc.attendance.importRecords.useMutation({
    onSuccess: async result => {
      toast.success(`تم اعتماد ${result.applied} صف؛ تم استبعاد ${result.skipped} صف للمراجعة.`);
      setDraft(null);
      setImportError(null);
      setImportProgress(null);
      await Promise.all([branchReport.refetch(), importHistory.refetch()]);
    },
    onError: error => { setImportError(error.message); setImportProgress({ phase: "error", value: 0, message: "تعذر اعتماد الصفوف. راجع الرسالة ثم أعد المحاولة." }); toast.error(error.message); },
  });

  const readFile = async (file?: File) => {
    if (!file) return;
    setDraft(null);
    setAnalysisSettings(undefined);
    setImportError(null);
    setImportProgress({ phase: "reading", value: 5, message: `تم اختيار «${file.name}». جارٍ بدء القراءة…` });
    try {
      const nextDraft = await parseAttendanceFile(file, setImportProgress);
      setDraft(nextDraft);
      toast.success(`تمت قراءة «${nextDraft.sourceFileName}». راجع الصفوف قبل الاعتماد.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر قراءة الملف.";
      setImportError(message);
      setImportProgress({ phase: "error", value: 0, message: "تعذرت قراءة الملف." });
      toast.error(message);
    }
  };

  const applyDraft = (submittedSettings?: AttendanceImportAnalysisSettings) => {
    if (!draft) return;
    const settings = submittedSettings ?? analysisSettings ?? defaultAttendanceImportAnalysisSettings;
    importRecords.mutate({
      branchId: activeBranchId,
      sourceFileName: draft.sourceFileName,
      sourceFormat: draft.sourceFormat,
      replaceExisting: false,
      confirmApply: true,
      rows: draft.rows.filter(row => !row.issues.length && row.workDate).map(row => {
        const employeeCode = row.employeeCode.trim().toUpperCase();
        const exception = settings.exceptions?.[row.rowNumber];
        const baseSchedule = settings.employeeSchedules?.[employeeCode] ?? { shiftStart: settings.shiftStart, shiftEnd: settings.shiftEnd, breakMinutes: settings.breakMinutes, graceMinutes: settings.graceMinutes };
        const schedule = exception?.treatment === "approved_alternative" ? { shiftStart: exception.alternativeShiftStart ?? baseSchedule.shiftStart, shiftEnd: exception.alternativeShiftEnd ?? baseSchedule.shiftEnd, breakMinutes: exception.alternativeBreakMinutes ?? baseSchedule.breakMinutes, graceMinutes: exception.alternativeGraceMinutes ?? baseSchedule.graceMinutes } : baseSchedule;
        return { employeeCode, workDate: row.workDate!, checkInAt: row.checkInAt, checkOutAt: row.checkOutAt, status: row.status, calculation: { treatment: exception?.treatment ?? "scheduled", schedule: exception?.treatment === "exclude_from_analysis" ? undefined : schedule, note: exception?.note } };
      }),
    });
  };

  const exportAttendanceReport = () => {
    const rows = branchReport.data ?? [];
    if (!rows.length) return toast.error("لا توجد بيانات التزام ضمن الفترة المحددة.");
    downloadExcelWorkbook("تقرير-الالتزام-بالحضور", ["الموظف", "الكود", "أيام مجدولة", "أيام حضور", "أيام غياب", "دقائق تأخير", "انصراف مبكر", "إضافي", "نسبة الحضور", "الالتزام بالمواعيد", "التزام الساعات", "درجة الالتزام"], mapAttendanceReportToExcelRows(rows), "تقرير الالتزام");
    toast.success(`تم تجهيز تقرير ${rows.length} موظف للتصدير.`);
  };

  const record = attendanceQuery.data;
  if (profileQuery.isSuccess && !hasEmployeeProfile && !manager) {
    return <section className="space-y-6"><Header /><Card className="border-[#f2d5d5] bg-white"><CardContent className="p-6"><Badge className="border-0 bg-[#fff1f1] text-[#b42318] hover:bg-[#fff1f1]">يلزم ربط الملف الوظيفي</Badge><h3 className="mt-3 text-lg font-extrabold text-[#17344a]">لا يوجد ملف موظف مرتبط بحسابك</h3><p className="mt-2 text-sm leading-7 text-slate-500">لن يتم إرسال طلبات حضور حتى يكتمل الربط.</p>{owner ? <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"><label className="block w-full max-w-sm"><span className="text-xs font-bold text-slate-600">فرع ملفك الوظيفي</span><select value={setupBranchId || ""} onChange={event => setSetupBranchId(Number(event.target.value))} className="mt-1 h-10 w-full rounded-xl border border-[#d7e6df] bg-white px-3 text-sm text-[#17344a] outline-none focus:ring-2 focus:ring-[#0f766e]"><option value="" disabled>اختر الفرع</option>{(branchesQuery.data ?? []).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><Button disabled={!setupBranchId || setupProfile.isPending} onClick={() => setupProfile.mutate({ branchId: setupBranchId })}>{setupProfile.isPending ? "جارٍ الربط…" : "إنشاء وربط ملفي الوظيفي"}</Button></div> : <p className="mt-4 text-sm font-bold text-[#b42318]">تواصل مع مالك النظام لربط حسابك بملف موظف قائم.</p>}</CardContent></Card></section>;
  }

  return <section className="space-y-6"><Header />{hasEmployeeProfile ? <Card className="border-[#e1ece6] bg-white"><CardContent className="p-6"><div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center"><div><p className="text-sm font-extrabold text-[#17344a]">سجل اليوم</p><p className="mt-1 text-xs text-slate-500">يتم حساب التأخير وساعات العمل آلياً من توقيت التسجيل.</p></div>{record?.checkOutAt ? <Badge className="bg-[#e6f5ef] text-[#0f766e] hover:bg-[#e6f5ef]">اكتملت وردية اليوم</Badge> : record?.checkInAt ? <Badge className="bg-[#fff3db] text-[#b87516] hover:bg-[#fff3db]">في وردية نشطة</Badge> : <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100">لم يُسجّل حضور</Badge>}</div><div className="mt-6 grid gap-3 sm:grid-cols-3"><Metric label="وقت الحضور" value={formatTime(record?.checkInAt)} /><Metric label="وقت الانصراف" value={formatTime(record?.checkOutAt)} /><Metric label="التأخير" value={`${record?.lateMinutes ?? 0} دقيقة`} /></div><div className="mt-6 flex flex-wrap gap-3"><Button disabled={Boolean(record?.checkInAt) || checkIn.isPending} onClick={() => checkIn.mutate()} className="bg-[#0f766e] hover:bg-[#0b5c56]">{checkIn.isPending ? "جارٍ التسجيل…" : "تسجيل الحضور"}</Button><Button variant="outline" disabled={!record?.checkInAt || Boolean(record?.checkOutAt) || checkOut.isPending} onClick={() => checkOut.mutate()} className="border-[#b9d8ca] text-[#0f766e] hover:bg-[#eaf4ef] hover:text-[#0f766e]">{checkOut.isPending ? "جارٍ التسجيل…" : "تسجيل الانصراف"}</Button></div></CardContent></Card> : null}{manager ? <><BranchPicker branches={branchesQuery.data ?? []} value={activeBranchId} onChange={setActiveBranchId} /><section className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]"><AttendanceImportPanel activeBranchId={activeBranchId} draft={draft} error={importError} progress={importProgress} applying={importRecords.isPending} onSelectFile={readFile} onUpdateDraft={setDraft} onApply={applyDraft} analysisSettings={analysisSettings} onAnalysisSettingsChange={setAnalysisSettings} /><ImportHistory /></section><AttendanceReport /></> : null}</section>;

  function Header() { return <div className="rounded-[1.75rem] border border-[#dce9e2] bg-white p-5 shadow-[0_18px_42px_-34px_rgba(23,52,74,.45)] sm:p-6"><Badge className="border-0 bg-[#e6f5ef] text-[#0f766e] hover:bg-[#e6f5ef]">سجل اليوم</Badge><h2 className="mt-3 text-2xl font-extrabold tracking-tight text-[#17344a]">الحضور والانصراف</h2><p className="mt-2 text-sm leading-7 text-slate-500">سجّل وقت الدخول والخروج، واستورد سجلات البصمة لمراجعتها قبل الاعتماد.</p></div>; }
  function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-[#f8fbf9] p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 font-extrabold text-[#17344a]">{value}</p></div>; }
  function BranchPicker({ branches, value, onChange }: { branches: Array<{ id: number; name: string }>; value: number; onChange: (value: number) => void }) { return branches.length <= 1 ? null : <label className="block max-w-xs"><span className="text-xs font-bold text-slate-600">الفرع الحالي</span><select value={value || ""} onChange={event => onChange(Number(event.target.value))} className="mt-1 h-10 w-full rounded-xl border border-[#d7e6df] bg-white px-3 text-sm text-[#17344a] outline-none focus:ring-2 focus:ring-[#0f766e]"><option value="" disabled>اختر الفرع</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>; }
  function ImportHistory() { return <Card className="border-[#e1ece6] bg-white"><CardContent className="p-5"><div className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-[#0f766e]" /><h3 className="font-extrabold text-[#17344a]">سجل دفعات الاستيراد</h3></div><p className="mt-2 text-xs leading-6 text-slate-500">تُحفظ فقط نتيجة الدفعة المعتمدة وسجل الصفوف، وليس ملف المصدر الخام.</p>{(importHistory.data ?? []).length ? <div className="mt-3 divide-y divide-[#edf3ef]">{importHistory.data?.map(batch => <div key={batch.id} className="py-3 text-xs"><p className="font-bold text-[#17344a]">{batch.sourceFileName}</p><p className="mt-1 text-slate-500">قُبل {batch.acceptedRows} / {batch.totalRows} صف</p><Badge className={batch.status === "applied" ? "mt-2 bg-[#e6f5ef] text-[#0f766e] hover:bg-[#e6f5ef]" : "mt-2 bg-rose-50 text-rose-700 hover:bg-rose-50"}>{batch.status === "applied" ? "معتمدة" : "مرفوضة"}</Badge></div>)}</div> : <p className="mt-5 text-sm text-slate-500">لم تُستورد أي دفعات لهذا الفرع بعد.</p>}</CardContent></Card>; }
  function AttendanceReport() { const rows = branchReport.data ?? []; return <Card className="border-[#e1ece6] bg-white"><CardContent className="p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-[#0f766e]" /><h3 className="font-extrabold text-[#17344a]">تقرير الالتزام التشغيلي</h3></div><p className="mt-1 text-xs text-slate-500">مؤشر إداري لا يُنشئ خصماً أو حركة مالية تلقائياً.</p></div><Button size="sm" variant="outline" onClick={exportAttendanceReport} disabled={!rows.length} className="border-[#b9d8ca] text-[#0f766e] hover:bg-[#eaf4ef] hover:text-[#0f766e]"><FileDown className="ml-1 h-3.5 w-3.5" />تصدير Excel</Button></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label><span className="text-xs font-bold text-slate-600">من</span><Input type="date" value={reportFrom} onChange={event => setReportFrom(event.target.value)} className="mt-1" /></label><label><span className="text-xs font-bold text-slate-600">إلى</span><Input type="date" value={reportTo} onChange={event => setReportTo(event.target.value)} className="mt-1" /></label></div>{branchReport.isLoading ? <p className="mt-5 text-sm text-slate-500">جارٍ حساب الالتزام…</p> : rows.length ? <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[720px] text-right text-sm"><thead className="border-b border-[#d7e6df] text-xs text-slate-500"><tr><th className="pb-3">الموظف</th><th className="pb-3">حضور / غياب</th><th className="pb-3">تأخير</th><th className="pb-3">إضافي</th><th className="pb-3">الالتزام</th></tr></thead><tbody>{rows.map(row => <tr key={row.employeeId} className="border-b border-[#edf3ef]"><td className="py-3 font-bold text-[#17344a]">{row.fullName}<span className="mr-2 text-xs font-medium text-slate-400">{row.employeeCode}</span></td><td className="py-3">{row.summary.presentDays} / {row.summary.absentDays}</td><td className="py-3">{row.summary.totalLateMinutes} د</td><td className="py-3">{row.summary.overtimeMinutes} د</td><td className="py-3"><Badge className="bg-[#e6f5ef] text-[#0f766e] hover:bg-[#e6f5ef]">{row.summary.complianceScore.toFixed(1)}٪</Badge></td></tr>)}</tbody></table></div> : <p className="mt-5 text-sm text-slate-500">لا توجد ورديات ضمن الفترة المحددة لحساب التقرير.</p>}</CardContent></Card>; }
}
