import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { AttendanceImportAnalysis } from "@/lib/attendance-import-analysis";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import React from "react";

const distributionConfig = { value: { label: "عدد السجلات", color: "#0f766e" } } satisfies ChartConfig;
const employeeConfig = { score: { label: "درجة الالتزام", color: "#0f766e" }, lateMinutes: { label: "دقائق التأخير", color: "#d97706" }, earlyLeaveMinutes: { label: "انصراف مبكر", color: "#be123c" } } satisfies ChartConfig;

export function AttendanceImportAnalysisCharts({ analysis }: { analysis: AttendanceImportAnalysis }) {
  const distribution = [
    { label: "ضمن الإطار", value: analysis.assessments.filter(record => record.status === "on_time").length, color: "#0f766e" },
    { label: "تحتاج متابعة", value: analysis.assessments.filter(record => record.status === "needs_review").length, color: "#d97706" },
    { label: "غير قابلة للتحليل", value: analysis.assessments.filter(record => record.status === "not_analyzable").length, color: "#be123c" },
    { label: "غياب / بعذر", value: analysis.assessments.filter(record => record.status === "absent" || record.status === "excused").length, color: "#64748b" },
  ].filter(item => item.value > 0);
  const employees = analysis.employees.slice(0, 12).map(employee => ({ employee: employee.employeeCode, score: employee.score, lateMinutes: employee.lateMinutes, earlyLeaveMinutes: employee.earlyLeaveMinutes }));

  return <section className="mt-5 grid gap-4 xl:grid-cols-2" aria-label="رسوم تحليل الحضور">
    <div className="rounded-2xl border border-[#e2eee8] bg-white p-4"><div><h4 className="font-extrabold text-[#17344a]">توزيع حالات السجلات</h4><p className="mt-1 text-xs text-slate-500">حركة المؤشر فوق الجزء لمعرفة العدد الدقيق.</p></div>{distribution.length ? <ChartContainer config={distributionConfig} className="mt-3 aspect-auto h-[240px]"><PieChart><ChartTooltip content={<ChartTooltipContent nameKey="label" />} /><Pie data={distribution} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={54} outerRadius={82} paddingAngle={3}>{distribution.map(item => <Cell key={item.label} fill={item.color} />)}</Pie></PieChart></ChartContainer> : <p className="mt-8 text-center text-sm text-slate-500">لا توجد سجلات قابلة للعرض بعد.</p>}<div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-slate-600">{distribution.map(item => <span key={item.label} className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.label}: {item.value}</span>)}</div></div>
    <div className="rounded-2xl border border-[#e2eee8] bg-white p-4"><div><h4 className="font-extrabold text-[#17344a]">درجة الالتزام حسب الموظف</h4><p className="mt-1 text-xs text-slate-500">تظهر أول 12 موظفاً؛ التفاصيل الكاملة في الجدول والتقرير.</p></div>{employees.length ? <ChartContainer config={employeeConfig} className="mt-3 aspect-auto h-[240px]"><BarChart data={employees} margin={{ top: 8, right: 4, left: -20, bottom: 24 }}><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="employee" angle={-32} textAnchor="end" interval={0} tick={{ fontSize: 10 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 10 }} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="score" fill="var(--color-score)" radius={[5, 5, 0, 0]} /></BarChart></ChartContainer> : <p className="mt-8 text-center text-sm text-slate-500">لا توجد بيانات موظفين للرسم.</p>}</div>
    <div className="rounded-2xl border border-[#e2eee8] bg-white p-4 xl:col-span-2"><div><h4 className="font-extrabold text-[#17344a]">التأخير والانصراف المبكر</h4><p className="mt-1 text-xs text-slate-500">القيم بالدقائق لتوجيه المراجعة، وليست جزاءات أو خصومات.</p></div>{employees.length ? <ChartContainer config={employeeConfig} className="mt-3 aspect-auto h-[250px]"><BarChart data={employees} margin={{ top: 8, right: 4, left: -16, bottom: 24 }}><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="employee" angle={-32} textAnchor="end" interval={0} tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="lateMinutes" fill="var(--color-lateMinutes)" radius={[4, 4, 0, 0]} /><Bar dataKey="earlyLeaveMinutes" fill="var(--color-earlyLeaveMinutes)" radius={[4, 4, 0, 0]} /></BarChart></ChartContainer> : null}</div>
  </section>;
}
