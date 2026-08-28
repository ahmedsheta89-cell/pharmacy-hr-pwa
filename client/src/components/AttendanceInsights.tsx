import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import React, { useMemo, useState } from "react";

type AttendanceReportRow = {
  employeeId: number;
  employeeCode: string;
  fullName: string;
  expectedDays: number;
  summary: {
    presentDays: number;
    absentDays: number;
    totalLateMinutes: number;
    totalWorkedMinutes: number;
    totalScheduledMinutes: number;
    earlyLeaveMinutes: number;
    overtimeMinutes: number;
    attendanceRate: number;
    punctualityRate: number;
    hoursRate: number;
    complianceScore: number;
  };
};

const chartConfig = {
  compliance: { label: "درجة الالتزام", color: "#0f766e" },
  present: { label: "حضور", color: "#0f766e" },
  absent: { label: "غياب", color: "#e76f51" },
  scheduledHours: { label: "ساعات مخططة", color: "#17344a" },
  workedHours: { label: "ساعات فعلية", color: "#0f766e" },
  overtimeHours: { label: "ساعات إضافية للمراجعة", color: "#d97706" },
} satisfies ChartConfig;

function shortName(value: string) {
  return value.trim().split(/\s+/).slice(0, 2).join(" ");
}

export function AttendanceInsights({ report }: { report: AttendanceReportRow[] }) {
  const [employeeId, setEmployeeId] = useState<number>(0);
  const visibleReport = useMemo(() => employeeId ? report.filter(row => row.employeeId === employeeId) : report, [employeeId, report]);
  const summary = useMemo(() => report.reduce((result, row) => ({
    expectedDays: result.expectedDays + row.expectedDays,
    presentDays: result.presentDays + row.summary.presentDays,
    absentDays: result.absentDays + row.summary.absentDays,
    lateMinutes: result.lateMinutes + row.summary.totalLateMinutes,
    workedMinutes: result.workedMinutes + row.summary.totalWorkedMinutes,
    scheduledMinutes: result.scheduledMinutes + row.summary.totalScheduledMinutes,
    overtimeMinutes: result.overtimeMinutes + row.summary.overtimeMinutes,
    compliance: result.compliance + row.summary.complianceScore,
  }), { expectedDays: 0, presentDays: 0, absentDays: 0, lateMinutes: 0, workedMinutes: 0, scheduledMinutes: 0, overtimeMinutes: 0, compliance: 0 }), [report]);
  const chartRows = useMemo(() => visibleReport.slice(0, 8).map(row => ({
    name: shortName(row.fullName),
    compliance: Number(row.summary.complianceScore.toFixed(1)),
    lateMinutes: row.summary.totalLateMinutes,
  })), [visibleReport]);
  const selected = employeeId ? report.find(row => row.employeeId === employeeId) : null;
  const shiftRows = useMemo(() => visibleReport.slice(0, 8).map(row => ({ name: shortName(row.fullName), scheduledHours: Number((row.summary.totalScheduledMinutes / 60).toFixed(1)), workedHours: Number((row.summary.totalWorkedMinutes / 60).toFixed(1)), overtimeHours: Number((row.summary.overtimeMinutes / 60).toFixed(1)) })), [visibleReport]);
  const distribution = [
    { name: "present", value: summary.presentDays, fill: "var(--color-present)" },
    { name: "absent", value: summary.absentDays, fill: "var(--color-absent)" },
  ].filter(item => item.value > 0);
  const averageCompliance = report.length ? summary.compliance / report.length : 0;

  return <section className="mt-6 space-y-5" aria-label="لوحة تحليلات الحضور"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="text-base font-extrabold text-[#17344a]">لوحة تحليلات الحضور والورديات</h3><p className="mt-1 text-xs leading-6 text-slate-500">تتغير الرسوم حسب الفرع والفترة المختارين. استخدم التركيز لمراجعة موظف واحد من دون تعديل أي سجل.</p></div><label className="block w-full sm:w-64"><span className="text-xs font-bold text-slate-600">تركيز على موظف</span><select value={employeeId || "all"} onChange={event => setEmployeeId(event.target.value === "all" ? 0 : Number(event.target.value))} className="mt-1 h-10 w-full rounded-xl border border-[#d7e6df] bg-white px-3 text-sm text-[#17344a] outline-none focus:ring-2 focus:ring-[#0f766e]"><option value="all">كل موظفي التقرير</option>{report.map(row => <option key={row.employeeId} value={row.employeeId}>{row.fullName} · {row.employeeCode}</option>)}</select></label></div>{!report.length ? <Card className="border-[#e1ece6] bg-white"><CardContent className="p-5 text-sm text-slate-500">ستظهر الرسوم عند توفر ورديات وسجلات حضور ضمن الفترة المحددة.</CardContent></Card> : <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric label="متوسط الالتزام" value={`${averageCompliance.toFixed(1)}٪`} tone="good" /><Metric label="ورديات مخططة" value={`${summary.expectedDays} يوم`} tone="neutral" /><Metric label="ساعات فعلية" value={`${(summary.workedMinutes / 60).toFixed(1)} س`} tone="good" /><Metric label="إجمالي الغياب" value={`${summary.absentDays} يوم`} tone="alert" /><Metric label="التأخير" value={`${summary.lateMinutes} د`} tone="neutral" /></div><div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]"><Card className="border-[#e1ece6] bg-white"><CardContent className="p-5"><div className="flex items-center justify-between gap-3"><div><p className="font-extrabold text-[#17344a]">درجة الالتزام حسب الموظف</p><p className="mt-1 text-xs text-slate-500">حرّك المؤشر فوق العمود لعرض الدرجة. يظهر أول 8 موظفين بعد الفلترة للحفاظ على وضوح القراءة.</p></div><Badge className="border-0 bg-[#e6f5ef] text-[#0f766e] hover:bg-[#e6f5ef]">{visibleReport.length} موظف</Badge></div><ChartContainer config={chartConfig} className="mt-5 h-64 w-full"><BarChart data={chartRows} layout="vertical" margin={{ left: 8, right: 12 }}><CartesianGrid horizontal={false} /><XAxis type="number" domain={[0, 100]} tickLine={false} axisLine={false} /><YAxis type="category" dataKey="name" width={96} tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent hideIndicator />} /><Bar dataKey="compliance" name="compliance" radius={[0, 8, 8, 0]} fill="var(--color-compliance)" /></BarChart></ChartContainer></CardContent></Card><Card className="border-[#e1ece6] bg-white"><CardContent className="p-5"><p className="font-extrabold text-[#17344a]">توزيع أيام الحضور</p><p className="mt-1 text-xs text-slate-500">مقارنة مباشرة بين أيام الحضور والغياب ضمن نطاق التقرير.</p>{distribution.length ? <ChartContainer config={chartConfig} className="mt-5 h-56 w-full"><PieChart><ChartTooltip content={<ChartTooltipContent nameKey="name" />} /><Pie data={distribution} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={4}>{distribution.map(item => <Cell key={item.name} fill={item.fill} />)}</Pie></PieChart></ChartContainer> : <p className="mt-8 text-center text-sm text-slate-500">لا توجد أيام مسجلة للعرض.</p>}<div className="mt-2 flex justify-center gap-4 text-xs font-bold"><span className="text-[#0f766e]">حضور: {summary.presentDays}</span><span className="text-[#c45a44]">غياب: {summary.absentDays}</span></div></CardContent></Card></div><Card className="border-[#cce3d8] bg-[#fbfefc]"><CardContent className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-extrabold text-[#17344a]">الساعات المخططة والفعلية</p><p className="mt-1 text-xs text-slate-500">مقارنة شفافة بين أساس الوردية والوقت الفعلي. الإضافي مؤشر للمراجعة فقط وليس مكافأة.</p></div><Badge className="border-0 bg-[#eef8f4] text-[#0f766e] hover:bg-[#eef8f4]">المخطط {(summary.scheduledMinutes / 60).toFixed(1)} س</Badge></div><ChartContainer config={chartConfig} className="mt-4 h-72 w-full"><BarChart data={shiftRows} margin={{ top: 12, right: 4, left: -16, bottom: 32 }}><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="name" angle={-30} textAnchor="end" interval={0} tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="scheduledHours" fill="var(--color-scheduledHours)" radius={[4, 4, 0, 0]} /><Bar dataKey="workedHours" fill="var(--color-workedHours)" radius={[4, 4, 0, 0]} /><Bar dataKey="overtimeHours" fill="var(--color-overtimeHours)" radius={[4, 4, 0, 0]} /></BarChart></ChartContainer></CardContent></Card>{selected ? <Card className="border-[#cce3d8] bg-[#f8fcfa]"><CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-extrabold text-[#17344a]">ملخص {selected.fullName}</p><p className="mt-1 text-xs text-slate-500">خطط له {Math.floor(selected.summary.totalScheduledMinutes / 60)} ساعة · عمل {Math.floor(selected.summary.totalWorkedMinutes / 60)} ساعة · إضافي {selected.summary.overtimeMinutes} د · انصراف مبكر {selected.summary.earlyLeaveMinutes} د</p></div><Badge className="border-0 bg-[#e6f5ef] text-[#0f766e] hover:bg-[#e6f5ef]">التزام {selected.summary.complianceScore.toFixed(1)}٪</Badge></CardContent></Card> : null}</>}</section>;
}

export function AttendanceDashboard({ activeBranchId }: { activeBranchId: number }) {
  const { user } = useAuth();
  const canView = user?.role === "admin" || user?.role === "owner" || user?.role === "manager";
  const [from, setFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const report = trpc.attendance.branchReport.useQuery({ branchId: activeBranchId || 1, from: new Date(`${from}T00:00:00`), to: new Date(`${to}T00:00:00`) }, { enabled: canView && activeBranchId > 0 && Boolean(from && to) });
  if (!canView) return null;
  return <Card className="mt-6 border-[#cce3d8] bg-[#fbfefc]"><CardContent className="p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-extrabold text-[#17344a]">لوحة الحضور والانصراف</p><p className="mt-1 text-xs leading-6 text-slate-500">مؤشرات ورسوم تفاعلية مستقلة للمتابعة السريعة؛ لا تغيّر سجل الحضور أو مسير الرواتب.</p></div><div className="grid grid-cols-2 gap-2 sm:w-[21rem]"><label><span className="text-[11px] font-bold text-slate-600">من</span><Input type="date" value={from} onChange={event => setFrom(event.target.value)} className="mt-1 h-9" /></label><label><span className="text-[11px] font-bold text-slate-600">إلى</span><Input type="date" value={to} onChange={event => setTo(event.target.value)} className="mt-1 h-9" /></label></div></div>{report.isLoading ? <p className="mt-5 text-sm text-slate-500">جارٍ تحميل تحليلات الحضور…</p> : <AttendanceInsights report={report.data ?? []} />}</CardContent></Card>;
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "good" | "alert" | "neutral" }) {
  const className = tone === "good" ? "bg-[#e6f5ef] text-[#0f766e]" : tone === "alert" ? "bg-[#fff1f1] text-[#b42318]" : "bg-[#f4f8f6] text-[#17344a]";
  return <div className={`rounded-2xl p-4 ${className}`}><p className="text-xs font-bold opacity-80">{label}</p><p className="mt-2 text-xl font-extrabold">{value}</p></div>;
}
