import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { analyzeAttendanceImport, defaultAttendanceImportAnalysisSettings, type AttendanceImportAnalysisSettings } from "@/lib/attendance-import-analysis";
import type { AttendanceImportDraft } from "@/lib/attendance-import";
import { BarChart3, CircleAlert, Clock3, UsersRound } from "lucide-react";
import React, { useMemo, useState } from "react";

type AttendanceImportAnalysisPanelProps = { draft: AttendanceImportDraft };

function minutesLabel(value: number) {
  return `${Math.floor(value / 60)} س ${value % 60} د`;
}

export function AttendanceImportAnalysisPanel({ draft }: AttendanceImportAnalysisPanelProps) {
  const [settings, setSettings] = useState<AttendanceImportAnalysisSettings>(defaultAttendanceImportAnalysisSettings);
  const analysis = useMemo(() => analyzeAttendanceImport(draft, settings), [draft, settings]);
  const invalidSchedule = analysis.expectedShiftMinutes === 0;

  const setNumber = (key: "graceMinutes" | "targetScore", value: string) => setSettings(current => ({ ...current, [key]: Number(value) }));

  return <Card className="border-[#cce3d8] bg-[#f8fcfa]"><CardContent className="p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-[#0f766e]" /><h3 className="font-extrabold text-[#17344a]">تحليل دفعة الحضور قبل الاعتماد</h3></div><p className="mt-2 max-w-2xl text-xs leading-6 text-slate-600">أجب عن إعدادات الوردية لهذه الدفعة، ثم راجع النتيجة لكل موظف. التقييم تشغيلي للمراجعة فقط ولا ينشئ خصماً أو راتباً أو جزاءً تلقائياً.</p></div><Badge className="w-fit border-0 bg-[#e6f5ef] text-[#0f766e] hover:bg-[#e6f5ef]">{draft.detectedLayout === "device_report" ? "تم التعرف على تقرير البصمة" : "قالب حضور قياسي"}</Badge></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Question label="بداية الوردية" hint="متى يبدأ الدوام؟"><Input aria-label="بداية الوردية للتحليل" type="time" value={settings.shiftStart} onChange={event => setSettings(current => ({ ...current, shiftStart: event.target.value }))} /></Question><Question label="نهاية الوردية" hint="متى ينتهي الدوام؟"><Input aria-label="نهاية الوردية للتحليل" type="time" value={settings.shiftEnd} onChange={event => setSettings(current => ({ ...current, shiftEnd: event.target.value }))} /></Question><Question label="سماحية التأخير" hint="بالدقائق، دون جزاء تلقائي"><Input aria-label="سماحية التأخير بالدقائق" type="number" min="0" max="240" value={settings.graceMinutes} onChange={event => setNumber("graceMinutes", event.target.value)} /></Question><Question label="حد الالتزام المستهدف" hint="لتمييز النتيجة للمراجعة"><Input aria-label="حد الالتزام المستهدف" type="number" min="0" max="100" value={settings.targetScore} onChange={event => setNumber("targetScore", event.target.value)} /></Question></div>
    {invalidSchedule ? <div role="alert" className="mt-3 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800"><CircleAlert className="h-4 w-4 shrink-0" />يجب أن يكون وقت نهاية الوردية بعد وقت البداية حتى يمكن حساب المدة والتقييم.</div> : <p className="mt-3 flex items-center gap-2 text-xs text-[#47645a]"><Clock3 className="h-4 w-4 text-[#0f766e]" />مدة الوردية المحسوبة: <strong>{minutesLabel(analysis.expectedShiftMinutes)}</strong> · الدرجة = الحضور 60٪ + الالتزام بالمواعيد 25٪ + اكتمال الساعات 15٪.</p>}
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="صفوف الشيت" value={analysis.totalRows} detail="سجلات قابلة للمراجعة" /><Metric label="موظفون في الدفعة" value={analysis.employeeCount} detail="بحسب كود الموظف" icon={<UsersRound className="h-4 w-4" />} /><Metric label="سجلات مكتملة" value={analysis.validRows} detail="قابلة للتحليل" tone="good" /><Metric label="تحتاج متابعة" value={analysis.reviewRows} detail="تأخير أو نقص بيانات" tone="alert" /></div>
    <div className="mt-5 overflow-x-auto rounded-xl border border-[#e2eee8] bg-white"><table className="w-full min-w-[720px] text-right text-xs"><thead className="bg-[#f4faf7] text-[#47645a]"><tr><th className="p-3">الموظف</th><th className="p-3">الشيفتات</th><th className="p-3">التأخير</th><th className="p-3">انصراف مبكر</th><th className="p-3">إضافي</th><th className="p-3">درجة الالتزام</th><th className="p-3">النتيجة</th></tr></thead><tbody>{analysis.employees.map(employee => <tr key={employee.employeeCode} className="border-t border-[#edf3ef]"><td className="p-3 font-bold text-[#17344a]">{employee.employeeCode}</td><td className="p-3">{employee.completeShifts} مكتمل / {employee.importedRows}</td><td className="p-3">{employee.lateMinutes} د</td><td className="p-3">{employee.earlyLeaveMinutes} د</td><td className="p-3">{employee.overtimeMinutes} د</td><td className="p-3 font-extrabold text-[#17344a]">{employee.score.toFixed(1)}٪</td><td className="p-3">{employee.reviewRows ? <Badge className="border-0 bg-amber-100 text-amber-800 hover:bg-amber-100">{employee.reviewRows} سجل للمراجعة</Badge> : employee.meetsTarget ? <Badge className="border-0 bg-[#e6f5ef] text-[#0f766e] hover:bg-[#e6f5ef]">ضمن الحد المحدد</Badge> : <Badge className="border-0 bg-red-100 text-red-800 hover:bg-red-100">دون حد الالتزام</Badge>}</td></tr>)}</tbody></table></div>
    {analysis.assessments.some(record => record.status === "needs_review" || record.status === "not_analyzable") ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="font-bold text-amber-900">سجلات تحتاج إلى مراجعة</p><div className="mt-2 flex flex-wrap gap-2">{analysis.assessments.filter(record => record.status === "needs_review" || record.status === "not_analyzable").slice(0, 12).map(record => <Badge key={record.rowNumber} variant="outline" className="border-amber-300 bg-white text-amber-900">صف {record.rowNumber} · {record.employeeCode || "بدون كود"} · {record.reasons.join("، ")}</Badge>)}</div></div> : null}
  </CardContent></Card>;
}

function Question({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs font-bold text-[#17344a]">{label}</span><span className="mr-1 text-[11px] text-slate-500">{hint}</span><div className="mt-1">{children}</div></label>;
}

function Metric({ label, value, detail, tone = "neutral", icon }: { label: string; value: number; detail: string; tone?: "neutral" | "good" | "alert"; icon?: React.ReactNode }) {
  const color = tone === "good" ? "border-[#b9d8ca] bg-[#eef8f4] text-[#0f766e]" : tone === "alert" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-[#17344a]";
  return <div className={`rounded-xl border p-3 ${color}`}><div className="flex items-center gap-1 text-xs font-bold">{icon}{label}</div><p className="mt-2 text-2xl font-extrabold">{value}</p><p className="mt-1 text-[11px] opacity-75">{detail}</p></div>;
}
