import { Input } from "@/components/ui/input";
import type { AttendanceImportAnalysis, AttendanceImportAnalysisSettings, AttendanceExceptionTreatment, AttendanceImportException } from "@/lib/attendance-import-analysis";
import type { AttendanceImportDraft } from "@/lib/attendance-import";
import { ClipboardCheck, HelpCircle } from "lucide-react";
import React from "react";

type Props = { draft: AttendanceImportDraft; analysis: AttendanceImportAnalysis; settings: AttendanceImportAnalysisSettings; onChange: (settings: AttendanceImportAnalysisSettings) => void };

const treatmentOptions: Array<{ value: AttendanceExceptionTreatment; label: string }> = [
  { value: "scheduled", label: "وفق وردية الموظف الأساسية" },
  { value: "approved_normal", label: "استئذان معتمد — يعامل كيوم عادي" },
  { value: "approved_alternative", label: "وردية بديلة معتمدة" },
  { value: "overtime_review", label: "وقت إضافي للمراجعة" },
  { value: "hourly_review", label: "وقت فعلي ساعة بساعة للمراجعة" },
  { value: "unapproved_shortfall", label: "عجز غير معتمد — للمراجعة فقط" },
  { value: "exclude_from_analysis", label: "استبعاد من التحليل لهذه الدفعة" },
];

function displayDate(value?: Date) { return value ? new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(value) : "تاريخ غير متاح"; }

export function AttendanceImportExceptionPanel({ draft, analysis, settings, onChange }: Props) {
  const candidates = analysis.assessments.filter(assessment => assessment.status === "needs_review" || assessment.status === "not_analyzable" || assessment.treatment !== "scheduled");
  const update = (rowNumber: number, patch: Partial<AttendanceImportException>) => {
    const current = settings.exceptions?.[rowNumber] ?? { treatment: "scheduled" as const };
    onChange({ ...settings, exceptions: { ...(settings.exceptions ?? {}), [rowNumber]: { ...current, ...patch } } });
  };
  if (!candidates.length) return <section className="mt-5 rounded-2xl border border-[#cce3d8] bg-[#eef8f4] p-4"><div className="flex items-start gap-2"><ClipboardCheck className="mt-0.5 h-5 w-5 text-[#0f766e]" /><div><h4 className="font-extrabold text-[#17344a]">لا توجد استثناءات تحتاج تصنيفاً</h4><p className="mt-1 text-xs leading-6 text-[#47645a]">إذا ظهر اختلاف في حضور موظف عند تعديل ورديته أو السجل، ستظهر هنا خيارات معاملته قبل الاعتماد.</p></div></div></section>;
  return <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-start gap-2"><HelpCircle className="mt-0.5 h-5 w-5 text-amber-800" /><div><h4 className="font-extrabold text-amber-950">اسأل قبل احتساب اليوم المختلف</h4><p className="mt-1 text-xs leading-6 text-amber-900">لكل سجل مختلف: هل كان باستئذان؟ وهل يعامل كوردية بديلة أو وقت إضافي أو وقت فعلي؟ يبقى أي عجز للمراجعة ولا يتحول إلى خصم تلقائي.</p><p className="mt-1 text-[11px] font-bold text-amber-950">يُحفظ القرار المختار مع الاعتماد كسجل تشغيلي قابل للتدقيق؛ لا ينشئ مكافأة أو خصماً أو حركة مسير.</p></div></div><div className="mt-4 space-y-3">{candidates.map(assessment => {
    const row = draft.rows.find(item => item.rowNumber === assessment.rowNumber);
    if (!row) return null;
    const exception = settings.exceptions?.[assessment.rowNumber] ?? { treatment: "scheduled" as const };
    return <div key={assessment.rowNumber} className="rounded-xl border border-amber-200 bg-white p-3"><div className="flex flex-col justify-between gap-1 sm:flex-row"><p className="font-extrabold text-[#17344a]">{assessment.employeeCode || "بدون كود"} <span className="mr-2 text-xs font-medium text-slate-500">{displayDate(row.workDate)} · صف {assessment.rowNumber}</span></p><p className="text-xs text-amber-900">{assessment.reasons.join("، ")}</p></div><div className="mt-3 grid gap-3 lg:grid-cols-[1.2fr_.8fr]"><label className="block"><span className="text-[11px] font-bold text-[#47645a]">كيف يُعامل هذا الاختلاف؟</span><select aria-label={`معاملة الصف ${assessment.rowNumber}`} value={exception.treatment} onChange={event => update(assessment.rowNumber, { treatment: event.target.value as AttendanceExceptionTreatment })} className="mt-1 h-10 w-full rounded-xl border border-[#d7e6df] bg-white px-3 text-sm font-bold text-[#17344a] outline-none focus:ring-2 focus:ring-[#0f766e]">{treatmentOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="block"><span className="text-[11px] font-bold text-[#47645a]">سبب / ملاحظة (اختياري)</span><Input aria-label={`سبب استثناء الصف ${assessment.rowNumber}`} value={exception.note ?? ""} onChange={event => update(assessment.rowNumber, { note: event.target.value })} placeholder="مثال: استئذان معتمد من المدير" /></label></div>{exception.treatment === "approved_alternative" ? <div className="mt-3 grid gap-3 sm:grid-cols-4"><TinyField label="بداية الوردية البديلة"><Input aria-label={`بداية بديلة للصف ${assessment.rowNumber}`} type="time" value={exception.alternativeShiftStart ?? settings.shiftStart} onChange={event => update(assessment.rowNumber, { alternativeShiftStart: event.target.value })} /></TinyField><TinyField label="نهاية الوردية البديلة"><Input aria-label={`نهاية بديلة للصف ${assessment.rowNumber}`} type="time" value={exception.alternativeShiftEnd ?? settings.shiftEnd} onChange={event => update(assessment.rowNumber, { alternativeShiftEnd: event.target.value })} /></TinyField><TinyField label="استراحة (د)"><Input aria-label={`استراحة بديلة للصف ${assessment.rowNumber}`} type="number" min="0" max="480" value={exception.alternativeBreakMinutes ?? settings.breakMinutes} onChange={event => update(assessment.rowNumber, { alternativeBreakMinutes: Number(event.target.value) })} /></TinyField><TinyField label="سماحية (د)"><Input aria-label={`سماحية بديلة للصف ${assessment.rowNumber}`} type="number" min="0" max="240" value={exception.alternativeGraceMinutes ?? settings.graceMinutes} onChange={event => update(assessment.rowNumber, { alternativeGraceMinutes: Number(event.target.value) })} /></TinyField></div> : null}</div>;
  })}</div></section>;
}

function TinyField({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="text-[11px] font-bold text-[#47645a]">{label}</span><div className="mt-1">{children}</div></label>; }
