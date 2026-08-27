import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AttendanceEmployeeSchedule, AttendanceImportAnalysisSettings } from "@/lib/attendance-import-analysis";
import type { AttendanceImportDraft } from "@/lib/attendance-import";
import { CheckSquare, CopyCheck, UsersRound } from "lucide-react";
import React, { useMemo, useState } from "react";

type Props = { draft: AttendanceImportDraft; settings: AttendanceImportAnalysisSettings; onChange: (settings: AttendanceImportAnalysisSettings) => void };

function normalizedCode(value: string) { return value.trim().toUpperCase(); }
function defaultSchedule(settings: AttendanceImportAnalysisSettings): AttendanceEmployeeSchedule { return { shiftStart: settings.shiftStart, shiftEnd: settings.shiftEnd, breakMinutes: settings.breakMinutes, graceMinutes: settings.graceMinutes }; }

export function AttendanceEmployeeSchedulePanel({ draft, settings, onChange }: Props) {
  const employees = useMemo(() => Array.from(new Set(draft.rows.map(row => normalizedCode(row.employeeCode)).filter(Boolean))).sort((left, right) => left.localeCompare(right, "en")), [draft.rows]);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkSchedule, setBulkSchedule] = useState<AttendanceEmployeeSchedule>(() => defaultSchedule(settings));
  const schedules = settings.employeeSchedules ?? {};
  const employeeRows = employees.map(code => ({ code, count: draft.rows.filter(row => normalizedCode(row.employeeCode) === code).length, schedule: schedules[code] ?? defaultSchedule(settings) }));
  const updateSchedule = (code: string, patch: Partial<AttendanceEmployeeSchedule>) => onChange({ ...settings, employeeSchedules: { ...schedules, [code]: { ...(schedules[code] ?? defaultSchedule(settings)), ...patch } } });
  const toggleEmployee = (code: string) => setSelected(current => current.includes(code) ? current.filter(value => value !== code) : [...current, code]);
  const applyBulk = () => {
    if (!selected.length) return;
    const nextSchedules = { ...schedules };
    selected.forEach(code => { nextSchedules[code] = { ...bulkSchedule }; });
    onChange({ ...settings, employeeSchedules: nextSchedules });
  };

  if (!employees.length) return null;
  return <section className="mt-5 rounded-2xl border border-[#d6e7df] bg-white p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><div className="flex items-center gap-2"><UsersRound className="h-5 w-5 text-[#0f766e]" /><h4 className="font-extrabold text-[#17344a]">وردية كل موظف في هذه الدفعة</h4></div><p className="mt-1 text-xs leading-6 text-slate-500">حدّد بداية ونهاية وردية الموظف والاستراحة والسماحية. تُستخدم هذه الإعدادات في الحساب والتقرير لهذه الدفعة.</p></div><span className="w-fit rounded-full bg-[#e6f5ef] px-3 py-1 text-xs font-bold text-[#0f766e]">{employees.length} موظف</span></div>
    <div className="mt-4 rounded-xl bg-[#f4faf7] p-3"><div className="flex flex-col gap-3 lg:flex-row lg:items-end"><div className="grid flex-1 gap-2 sm:grid-cols-4"><TinyField label="بداية موحدة"><Input aria-label="بداية الوردية الجماعية" type="time" value={bulkSchedule.shiftStart} onChange={event => setBulkSchedule(value => ({ ...value, shiftStart: event.target.value }))} /></TinyField><TinyField label="نهاية موحدة"><Input aria-label="نهاية الوردية الجماعية" type="time" value={bulkSchedule.shiftEnd} onChange={event => setBulkSchedule(value => ({ ...value, shiftEnd: event.target.value }))} /></TinyField><TinyField label="استراحة (د)"><Input aria-label="استراحة الوردية الجماعية" type="number" min="0" max="480" value={bulkSchedule.breakMinutes} onChange={event => setBulkSchedule(value => ({ ...value, breakMinutes: Number(event.target.value) }))} /></TinyField><TinyField label="سماحية (د)"><Input aria-label="سماحية الوردية الجماعية" type="number" min="0" max="240" value={bulkSchedule.graceMinutes} onChange={event => setBulkSchedule(value => ({ ...value, graceMinutes: Number(event.target.value) }))} /></TinyField></div><Button type="button" size="sm" variant="outline" disabled={!selected.length} onClick={applyBulk} className="border-[#b9d8ca] text-[#0f766e] hover:bg-[#eaf4ef] hover:text-[#0f766e]"><CopyCheck className="ml-1 h-4 w-4" />تطبيق على المحدد ({selected.length})</Button></div></div>
    <div className="mt-4 space-y-3">{employeeRows.map(({ code, count, schedule }) => <div key={code} className="rounded-xl border border-[#e5efea] p-3"><div className="grid gap-3 lg:grid-cols-[minmax(150px,.8fr)_repeat(4,minmax(120px,1fr))]"><label className="flex items-center gap-2 pt-5 text-sm font-extrabold text-[#17344a]"><input aria-label={`تحديد الموظف ${code}`} type="checkbox" checked={selected.includes(code)} onChange={() => toggleEmployee(code)} className="h-4 w-4 accent-[#0f766e]" /><span>{code}<small className="mr-2 font-medium text-slate-400">{count} سجل</small></span></label><TinyField label="من"><Input aria-label={`بداية وردية ${code}`} type="time" value={schedule.shiftStart} onChange={event => updateSchedule(code, { shiftStart: event.target.value })} /></TinyField><TinyField label="إلى"><Input aria-label={`نهاية وردية ${code}`} type="time" value={schedule.shiftEnd} onChange={event => updateSchedule(code, { shiftEnd: event.target.value })} /></TinyField><TinyField label="استراحة (د)"><Input aria-label={`استراحة ${code}`} type="number" min="0" max="480" value={schedule.breakMinutes} onChange={event => updateSchedule(code, { breakMinutes: Number(event.target.value) })} /></TinyField><TinyField label="سماحية (د)"><Input aria-label={`سماحية ${code}`} type="number" min="0" max="240" value={schedule.graceMinutes} onChange={event => updateSchedule(code, { graceMinutes: Number(event.target.value) })} /></TinyField></div></div>)}</div>
    <p className="mt-3 flex items-center gap-2 text-[11px] text-[#47645a]"><CheckSquare className="h-3.5 w-3.5 text-[#0f766e]" />يمكنك تحديد موظف أو مجموعة ثم تطبيق وردية موحدة، وبعدها تعديل أي موظف منفرداً.</p>
  </section>;
}

function TinyField({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="text-[11px] font-bold text-[#47645a]">{label}</span><div className="mt-1">{children}</div></label>; }
