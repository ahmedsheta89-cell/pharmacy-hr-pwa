import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AttendanceImportAnalysisCharts } from "@/components/AttendanceImportAnalysisCharts";
import { AttendanceEmployeeSchedulePanel } from "@/components/AttendanceEmployeeSchedulePanel";
import { AttendanceImportExceptionPanel } from "@/components/AttendanceImportExceptionPanel";
import { exportAttendanceImportAnalysisExcel, exportAttendanceImportAnalysisPdf } from "@/lib/attendance-import-analysis-export";
import { analyzeAttendanceImport, defaultAttendanceImportAnalysisSettings, type AttendanceImportAnalysisSettings, type AttendanceImportException } from "@/lib/attendance-import-analysis";
import type { AttendanceImportDraft } from "@/lib/attendance-import";
import { trpc } from "@/lib/trpc";
import { BarChart3, CheckCircle2, CircleAlert, Clock3, FileDown, FileText, LoaderCircle, Save, UsersRound } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type AttendanceImportAnalysisPanelProps = { activeBranchId: number; draft: AttendanceImportDraft; onSettingsChange?: (settings: AttendanceImportAnalysisSettings) => void };
type PersistedImportException = Pick<AttendanceImportException, "treatment" | "note" | "alternativeShiftStart" | "alternativeShiftEnd" | "alternativeBreakMinutes" | "alternativeGraceMinutes">;

function minutesLabel(value: number) {
  return `${Math.floor(value / 60)} س ${value % 60} د`;
}

export function AttendanceImportAnalysisPanel({ activeBranchId, draft, onSettingsChange }: AttendanceImportAnalysisPanelProps) {
  const [settings, setSettings] = useState<AttendanceImportAnalysisSettings>(defaultAttendanceImportAnalysisSettings);
  const policyQuery = trpc.policies.attendance.useQuery({ branchId: activeBranchId }, { enabled: activeBranchId > 0 });
  const employeeSchedulesQuery = trpc.attendance.importSchedules.useQuery({ branchId: activeBranchId }, { enabled: activeBranchId > 0 });
  const exceptionDateRange = useMemo(() => {
    const dates = draft.rows.map(row => row.workDate).filter((value): value is Date => Boolean(value));
    if (!dates.length) return null;
    return { from: new Date(Math.min(...dates.map(value => value.getTime()))), to: new Date(Math.max(...dates.map(value => value.getTime()))) };
  }, [draft.rows]);
  const importExceptionsQuery = trpc.attendance.importExceptions.useQuery({ branchId: activeBranchId, from: exceptionDateRange?.from ?? new Date(0), to: exceptionDateRange?.to ?? new Date(0) }, { enabled: activeBranchId > 0 && Boolean(exceptionDateRange) });
  const appliedPolicyKey = useRef<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const saveDefault = trpc.policies.saveImportAnalysis.useMutation({ onSuccess: async () => { await policyQuery.refetch(); toast.success("تم حفظ إعدادات الوردية كسياسة افتراضية لهذا الفرع."); }, onError: error => toast.error(error.message) });
  const saveEmployeeDefaults = trpc.attendance.saveImportSchedules.useMutation({ onSuccess: async result => { await employeeSchedulesQuery.refetch(); toast.success(result.notFoundCodes.length ? `تم حفظ ${result.saved} وردية؛ ${result.notFoundCodes.length} كود غير موجود لم يُحفظ.` : `تم حفظ ورديات ${result.saved} موظفاً كإعدادات ثابتة.`); }, onError: error => toast.error(error.message) });
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfStatus, setPdfStatus] = useState<"idle" | "success" | "error">("idle");
  const analysis = useMemo(() => analyzeAttendanceImport(draft, settings), [draft, settings]);
  const invalidSchedule = analysis.expectedShiftMinutes === 0;

  const setNumber = (key: "breakMinutes" | "graceMinutes" | "targetScore", value: string) => setSettings(current => ({ ...current, [key]: Number(value) }));
  useEffect(() => {
    const initializationKey = `${activeBranchId}:${draft.sourceFileName}:${exceptionDateRange?.from.toISOString() ?? ""}:${exceptionDateRange?.to.toISOString() ?? ""}`;
    if (!activeBranchId || policyQuery.isLoading || employeeSchedulesQuery.isLoading || importExceptionsQuery.isLoading || appliedPolicyKey.current === initializationKey) return;
    const policy = policyQuery.data;
    const employeeSchedules = Object.fromEntries((employeeSchedulesQuery.data ?? []).map(item => [item.employeeCode.trim().toUpperCase(), { shiftStart: String(item.schedule.shiftStart).slice(0, 5), shiftEnd: String(item.schedule.shiftEnd).slice(0, 5), breakMinutes: item.schedule.breakMinutes, graceMinutes: item.schedule.graceMinutes }]));
    const exceptionByEmployeeDate = new Map<string, PersistedImportException>((importExceptionsQuery.data ?? []).map(item => [`${item.employeeCode.trim().toUpperCase()}:${item.exception.workDate.toISOString().slice(0, 10)}`, { treatment: item.exception.treatment, note: item.exception.decisionNote ?? undefined, alternativeShiftStart: item.exception.shiftStart ? String(item.exception.shiftStart).slice(0, 5) : undefined, alternativeShiftEnd: item.exception.shiftEnd ? String(item.exception.shiftEnd).slice(0, 5) : undefined, alternativeBreakMinutes: item.exception.breakMinutes ?? undefined, alternativeGraceMinutes: item.exception.graceMinutes ?? undefined }]));
    const exceptions = Object.fromEntries(draft.rows.flatMap(row => {
      if (!row.workDate) return [];
      const exception = exceptionByEmployeeDate.get(`${row.employeeCode.trim().toUpperCase()}:${row.workDate.toISOString().slice(0, 10)}`);
      if (!exception) return [];
      return [[row.rowNumber, exception]];
    }));
    if (policy) setSettings({ shiftStart: String(policy.analysisShiftStart).slice(0, 5), shiftEnd: String(policy.analysisShiftEnd).slice(0, 5), breakMinutes: policy.analysisBreakMinutes, graceMinutes: policy.graceMinutes, targetScore: policy.analysisTargetScore, employeeSchedules, exceptions });
    else setSettings(current => ({ ...current, employeeSchedules, exceptions }));
    appliedPolicyKey.current = initializationKey;
  }, [activeBranchId, draft.rows, draft.sourceFileName, employeeSchedulesQuery.data, employeeSchedulesQuery.isLoading, exceptionDateRange, importExceptionsQuery.data, importExceptionsQuery.isLoading, policyQuery.data, policyQuery.isLoading]);
  useEffect(() => { onSettingsChange?.(settings); }, [onSettingsChange, settings]);
  const handleSaveDefault = () => saveDefault.mutate({ branchId: activeBranchId, shiftStart: settings.shiftStart, shiftEnd: settings.shiftEnd, breakMinutes: Math.max(0, Math.min(480, Number(settings.breakMinutes) || 0)), graceMinutes: Math.max(0, Math.min(240, Number(settings.graceMinutes) || 0)), targetScore: Math.max(0, Math.min(100, Number(settings.targetScore) || 0)) });
  const handleSaveEmployeeDefaults = () => {
    const codes = Array.from(new Set(draft.rows.map(row => row.employeeCode.trim().toUpperCase()).filter(Boolean)));
    if (!codes.length) return;
    saveEmployeeDefaults.mutate({ branchId: activeBranchId, schedules: codes.map(employeeCode => ({ employeeCode, ...(settings.employeeSchedules?.[employeeCode] ?? { shiftStart: settings.shiftStart, shiftEnd: settings.shiftEnd, breakMinutes: settings.breakMinutes, graceMinutes: settings.graceMinutes }) })) });
  };
  const handlePdfExport = async () => {
    if (!reportRef.current) return;
    setExportingPdf(true);
    setPdfStatus("idle");
    try { const result = await exportAttendanceImportAnalysisPdf(reportRef.current, draft); setPdfStatus("success"); toast.success(`تم تجهيز ${result.filename}.`); } catch { setPdfStatus("error"); toast.error("تعذر تجهيز ملف PDF. حاول مرة أخرى."); } finally { setExportingPdf(false); }
  };

  return <Card className="border-[#cce3d8] bg-[#f8fcfa]"><CardContent className="p-5">
    <div ref={reportRef} className="rounded-2xl bg-[#f8fcfa] p-1" dir="rtl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-[#0f766e]" /><h3 className="font-extrabold text-[#17344a]">تحليل دفعة الحضور قبل الاعتماد</h3></div><p className="mt-2 max-w-2xl text-xs leading-6 text-slate-600">أجب عن إعدادات الوردية لهذه الدفعة، ثم راجع النتيجة لكل موظف. التقييم تشغيلي للمراجعة فقط ولا ينشئ خصماً أو راتباً أو جزاءً تلقائياً.</p></div><Badge className="w-fit border-0 bg-[#e6f5ef] text-[#0f766e] hover:bg-[#e6f5ef]">{draft.detectedLayout === "device_report" ? "تم التعرف على تقرير البصمة" : "قالب حضور قياسي"}</Badge></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Question label="بداية الوردية" hint="متى يبدأ الدوام؟"><Input aria-label="بداية الوردية للتحليل" type="time" value={settings.shiftStart} onChange={event => setSettings(current => ({ ...current, shiftStart: event.target.value }))} /></Question><Question label="نهاية الوردية" hint="متى ينتهي الدوام؟"><Input aria-label="نهاية الوردية للتحليل" type="time" value={settings.shiftEnd} onChange={event => setSettings(current => ({ ...current, shiftEnd: event.target.value }))} /></Question><Question label="الاستراحة" hint="بالدقائق"><Input aria-label="استراحة الوردية بالدقائق" type="number" min="0" max="480" value={settings.breakMinutes} onChange={event => setNumber("breakMinutes", event.target.value)} /></Question><Question label="سماحية التأخير" hint="بالدقائق، دون جزاء تلقائي"><Input aria-label="سماحية التأخير بالدقائق" type="number" min="0" max="240" value={settings.graceMinutes} onChange={event => setNumber("graceMinutes", event.target.value)} /></Question><Question label="حد الالتزام المستهدف" hint="لتمييز النتيجة للمراجعة"><Input aria-label="حد الالتزام المستهدف" type="number" min="0" max="100" value={settings.targetScore} onChange={event => setNumber("targetScore", event.target.value)} /></Question></div>
      {invalidSchedule ? <div role="alert" className="mt-3 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800"><CircleAlert className="h-4 w-4 shrink-0" />يجب أن تختلف بداية الوردية عن نهايتها حتى يمكن حساب المدة والتقييم. الوردية التي تتجاوز منتصف الليل مدعومة.</div> : <p className="mt-3 flex items-center gap-2 text-xs text-[#47645a]"><Clock3 className="h-4 w-4 text-[#0f766e]" />مدة الوردية المحسوبة: <strong>{minutesLabel(analysis.expectedShiftMinutes)}</strong> · الدرجة = الحضور 60٪ + الالتزام بالمواعيد 25٪ + اكتمال الساعات 15٪.</p>}
      <AttendanceEmployeeSchedulePanel draft={draft} settings={settings} onChange={setSettings} />
      <div className="mt-3 flex justify-end"><Button type="button" size="sm" variant="outline" disabled={!activeBranchId || saveEmployeeDefaults.isPending} onClick={handleSaveEmployeeDefaults} className="border-[#b9d8ca] text-[#0f766e] hover:bg-[#eaf4ef] hover:text-[#0f766e]"><Save className="ml-1 h-3.5 w-3.5" />{saveEmployeeDefaults.isPending ? "جارٍ حفظ ورديات الموظفين…" : "حفظ ورديات الموظفين كإعدادات ثابتة"}</Button></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="صفوف الشيت" value={analysis.totalRows} detail="سجلات قابلة للمراجعة" /><Metric label="موظفون في الدفعة" value={analysis.employeeCount} detail="بحسب كود الموظف" icon={<UsersRound className="h-4 w-4" />} /><Metric label="سجلات مكتملة" value={analysis.validRows} detail="قابلة للتحليل" tone="good" /><Metric label="تحتاج متابعة" value={analysis.reviewRows} detail="تأخير أو نقص بيانات" tone="alert" /></div>
      <AttendanceImportExceptionPanel draft={draft} analysis={analysis} settings={settings} onChange={setSettings} />
      <AttendanceImportAnalysisCharts analysis={analysis} />
      <div className="mt-5 overflow-x-auto rounded-xl border border-[#e2eee8] bg-white"><table className="w-full min-w-[720px] text-right text-xs"><thead className="bg-[#f4faf7] text-[#47645a]"><tr><th className="p-3">الموظف</th><th className="p-3">الشيفتات</th><th className="p-3">التأخير</th><th className="p-3">انصراف مبكر</th><th className="p-3">إضافي</th><th className="p-3">درجة الالتزام</th><th className="p-3">النتيجة</th></tr></thead><tbody>{analysis.employees.map(employee => <tr key={employee.employeeCode} className="border-t border-[#edf3ef]"><td className="p-3 font-bold text-[#17344a]">{employee.employeeCode}</td><td className="p-3">{employee.completeShifts} مكتمل / {employee.importedRows}</td><td className="p-3">{employee.lateMinutes} د</td><td className="p-3">{employee.earlyLeaveMinutes} د</td><td className="p-3">{employee.overtimeMinutes} د</td><td className="p-3 font-extrabold text-[#17344a]">{employee.score.toFixed(1)}٪</td><td className="p-3">{employee.reviewRows ? <Badge className="border-0 bg-amber-100 text-amber-800 hover:bg-amber-100">{employee.reviewRows} سجل للمراجعة</Badge> : employee.meetsTarget ? <Badge className="border-0 bg-[#e6f5ef] text-[#0f766e] hover:bg-[#e6f5ef]">ضمن الحد المحدد</Badge> : <Badge className="border-0 bg-red-100 text-red-800 hover:bg-red-100">دون حد الالتزام</Badge>}</td></tr>)}</tbody></table></div>
      {analysis.assessments.some(record => record.status === "needs_review" || record.status === "not_analyzable") ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="font-bold text-amber-900">سجلات تحتاج إلى مراجعة</p><div className="mt-2 flex flex-wrap gap-2">{analysis.assessments.filter(record => record.status === "needs_review" || record.status === "not_analyzable").slice(0, 12).map(record => <Badge key={record.rowNumber} variant="outline" className="border-amber-300 bg-white text-amber-900">صف {record.rowNumber} · {record.employeeCode || "بدون كود"} · {record.reasons.join("، ")}</Badge>)}</div></div> : null}
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#d7e6df] pt-4"><Button size="sm" type="button" variant="outline" disabled={!activeBranchId || saveDefault.isPending} onClick={handleSaveDefault} className="border-[#b9d8ca] text-[#0f766e] hover:bg-[#eaf4ef] hover:text-[#0f766e]"><Save className="ml-1 h-3.5 w-3.5" />{saveDefault.isPending ? "جارٍ الحفظ…" : "حفظ كسياسة افتراضية"}</Button><Button size="sm" type="button" variant="outline" onClick={() => { exportAttendanceImportAnalysisExcel(draft, settings, analysis); toast.success("تم تجهيز تقرير Excel للإدارة."); }} className="border-[#b9d8ca] text-[#0f766e] hover:bg-[#eaf4ef] hover:text-[#0f766e]"><FileDown className="ml-1 h-3.5 w-3.5" />تصدير Excel</Button><Button size="sm" type="button" variant="outline" disabled={exportingPdf} onClick={handlePdfExport} aria-describedby="pdf-export-status" className="border-[#17344a] text-[#17344a] hover:bg-slate-50 hover:text-[#17344a]"><>{exportingPdf ? <LoaderCircle className="ml-1 h-3.5 w-3.5 motion-safe:animate-spin" /> : <FileText className="ml-1 h-3.5 w-3.5" />}</>{exportingPdf ? "جارٍ تجهيز PDF…" : "تصدير PDF"}</Button><p id="pdf-export-status" aria-live="polite" className={`text-xs font-bold ${exportingPdf ? "text-[#0f766e]" : pdfStatus === "success" ? "text-[#0f766e]" : pdfStatus === "error" ? "text-rose-700" : "text-slate-500"}`}>{exportingPdf ? "يتم تجهيز التقرير كصورة للحفاظ على العرض العربي؛ لا تغلق الصفحة." : pdfStatus === "success" ? <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />اكتمل تجهيز PDF؛ تحقق من تنزيلات المتصفح.</span> : pdfStatus === "error" ? "تعذر تجهيز PDF؛ لم تُعدّل أي بيانات ويمكنك إعادة المحاولة." : "سيتم تنزيل ملف PDF محلياً من المتصفح."}</p></div>
  </CardContent></Card>;
}

function Question({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs font-bold text-[#17344a]">{label}</span><span className="mr-1 text-[11px] text-slate-500">{hint}</span><div className="mt-1">{children}</div></label>;
}

function Metric({ label, value, detail, tone = "neutral", icon }: { label: string; value: number; detail: string; tone?: "neutral" | "good" | "alert"; icon?: React.ReactNode }) {
  const color = tone === "good" ? "border-[#b9d8ca] bg-[#eef8f4] text-[#0f766e]" : tone === "alert" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-[#17344a]";
  return <div className={`rounded-xl border p-3 ${color}`}><div className="flex items-center gap-1 text-xs font-bold">{icon}{label}</div><p className="mt-2 text-2xl font-extrabold">{value}</p><p className="mt-1 text-[11px] opacity-75">{detail}</p></div>;
}
