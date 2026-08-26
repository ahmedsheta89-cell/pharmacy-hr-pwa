import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { calculatePayrollScenario, scenarioMetricLabels } from "@/lib/payroll-simulation";
import { BadgeCheck, Calculator, CircleAlert, Database, Eye, Link2, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const fieldClass = "mt-1 h-10 rounded-xl border-[#cce3d8] bg-white text-[#17344a] shadow-sm focus-visible:ring-[#0f766e]";
const canManagePayroll = (role?: string) => role === "admin" || role === "owner" || role === "manager" || role === "hr_manager";
const displayMoney = (value: number) => new Intl.NumberFormat("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
type SimulationCatalogEntry = { employeeId: number; fullName: string; employeeCode: string; jobTitle: string; hasActiveSalary: boolean; salaryEffectiveFrom: Date | null };

export function PayrollScenarioSimulator({ activeBranchId }: { activeBranchId: number }) {
  const { user } = useAuth();
  const canManage = canManagePayroll(user?.role);
  const [employeeId, setEmployeeId] = useState(0);
  const [basicSalary, setBasicSalary] = useState("0");
  const [allowances, setAllowances] = useState("0");
  const [workingDays, setWorkingDays] = useState("26");
  const [from, setFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const periodFrom = useMemo(() => new Date(`${from}T00:00:00`), [from]);
  const periodTo = useMemo(() => new Date(`${to}T23:59:59`), [to]);
  const catalog = trpc.payroll.simulationCatalog.useQuery({ branchId: activeBranchId || 1, asOf: periodTo }, { enabled: canManage && activeBranchId > 0 && Boolean(to) });
  const rules = trpc.payroll.listRules.useQuery({ branchId: activeBranchId || 1 }, { enabled: canManage && activeBranchId > 0 });
  const report = trpc.attendance.branchReport.useQuery({ branchId: activeBranchId || 1, from: periodFrom, to: periodTo }, { enabled: canManage && activeBranchId > 0 && Boolean(from && to) });
  const simulationInputs = trpc.payroll.simulationInputs.useQuery({ employeeId, from: periodFrom, to: periodTo }, { enabled: canManage && employeeId > 0 && Boolean(from && to) });
  const catalogEntries = (catalog.data ?? []) as SimulationCatalogEntry[];
  const selectedCatalogEntry = useMemo(() => catalogEntries.find(employee => employee.employeeId === employeeId), [catalogEntries, employeeId]);
  const activeStructureCount = useMemo(() => catalogEntries.filter(employee => employee.hasActiveSalary).length, [catalogEntries]);

  useEffect(() => {
    if (employeeId || !catalogEntries.length) return;
    setEmployeeId((catalogEntries.find(employee => employee.hasActiveSalary) ?? catalogEntries[0]).employeeId);
  }, [catalogEntries, employeeId]);

  const applyStructureValues = () => {
    const salary = simulationInputs.data?.salary;
    if (!salary) return;
    setBasicSalary(String(salary.basicSalary));
    setAllowances(String(Number(salary.housingAllowance) + Number(salary.transportationAllowance) + Number(salary.otherAllowances)));
  };

  useEffect(() => {
    applyStructureValues();
    // Refreshing employee or period intentionally restores the approved structure for a new scenario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, simulationInputs.data?.salary?.id]);

  const selectedReport = useMemo(() => (report.data ?? []).find(item => item.employeeId === employeeId), [employeeId, report.data]);
  const scenario = useMemo(() => calculatePayrollScenario({ report: selectedReport, rules: rules.data ?? [], from: periodFrom, to: periodTo, basicSalary: Number(basicSalary) || 0, allowances: Number(allowances) || 0, workingDays: Number(workingDays) || 1, approvedAdjustments: simulationInputs.data?.approvedAdjustments ?? [] }), [allowances, basicSalary, periodFrom, periodTo, rules.data, selectedReport, simulationInputs.data?.approvedAdjustments, workingDays]);

  if (!canManage) return null;

  const sourceReady = Boolean(simulationInputs.data?.salary);
  const activeRuleCount = (rules.data ?? []).filter(rule => rule.isActive === "yes").length;
  const attendanceDays = selectedReport?.days.length ?? 0;
  const catalogError = catalog.error?.message;

  return (
    <Card className="overflow-hidden border-[#9ed1bc] bg-[radial-gradient(circle_at_top_left,#e3f8ec,transparent_32%),linear-gradient(135deg,#f7fcf9,#eaf7f0)] shadow-sm">
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2"><Calculator className="h-5 w-5 text-[#0f766e]" /><h3 className="font-extrabold text-[#17344a]">مختبر الرواتب الواقعي</h3></div>
            <p className="mt-2 max-w-2xl text-xs leading-6 text-slate-600">يقرأ هيكل الراتب الساري، الحضور المسجل، والقواعد والتعديلات المعتمدة في الفترة المختارة. لا ينشئ مسيراً ولا خصماً ولا مكافأة.</p>
          </div>
          <Badge className="w-fit border-0 bg-[#d8f3e5] text-[#08705f] hover:bg-[#d8f3e5]"><Eye className="ml-1 h-3.5 w-3.5" />قراءة ومحاكاة فقط</Badge>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SourceStat icon={<Database />} label="موظفون متاحون" value={catalogError ? "تعذر التحميل" : `${catalogEntries.length}`} detail={catalogError ? "أعد المحاولة لقراءة البيانات المصرح بها" : `${activeStructureCount} بهيكل ساري`} tone={catalogError ? "amber" : "teal"} />
          <SourceStat icon={<BadgeCheck />} label="هيكل الموظف" value={sourceReady ? "متصل" : "غير متاح"} detail={selectedCatalogEntry?.hasActiveSalary ? "ساري حتى تاريخ المحاكاة" : "تحقق من تاريخ السريان"} tone={sourceReady ? "teal" : "amber"} />
          <SourceStat icon={<ShieldCheck />} label="قواعد نشطة" value={`${activeRuleCount}`} detail="تُعرض آثارها التقديرية" tone="slate" />
          <SourceStat icon={<Link2 />} label="سجل الحضور" value={`${attendanceDays}`} detail={attendanceDays ? "أيام مسجلة في الفترة" : "لا توجد أيام مسجلة"} tone={attendanceDays ? "teal" : "slate"} />
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label><span className="text-xs font-bold text-slate-600">الموظف</span><select value={employeeId || ""} onChange={event => setEmployeeId(Number(event.target.value))} className={`${fieldClass} w-full`} aria-label="اختيار موظف للمحاكاة"><option value="" disabled>اختر الموظف</option>{catalogEntries.map(employee => <option key={employee.employeeId} value={employee.employeeId}>{employee.fullName} · {employee.employeeCode} · {employee.hasActiveSalary ? "هيكل ساري" : "دون هيكل ساري"}</option>)}</select></label>
          <label><span className="text-xs font-bold text-slate-600">من</span><Input type="date" value={from} onChange={event => setFrom(event.target.value)} className={fieldClass} /></label>
          <label><span className="text-xs font-bold text-slate-600">إلى</span><Input type="date" value={to} onChange={event => setTo(event.target.value)} className={fieldClass} /></label>
          <label><span className="text-xs font-bold text-slate-600">راتب أساسي للمحاكاة</span><Input type="number" min="0" step="0.01" value={basicSalary} onChange={event => setBasicSalary(event.target.value)} className={fieldClass} /></label>
          <label><span className="text-xs font-bold text-slate-600">بدلات للمحاكاة</span><Input type="number" min="0" step="0.01" value={allowances} onChange={event => setAllowances(event.target.value)} className={fieldClass} /></label>
          <label><span className="text-xs font-bold text-slate-600">أيام العمل في الشهر</span><Input type="number" min="1" max="31" value={workingDays} onChange={event => setWorkingDays(event.target.value)} className={fieldClass} /></label>
        </div>

        {catalog.isLoading || report.isLoading || simulationInputs.isLoading ? <p className="mt-5 text-sm text-slate-500">جارٍ تجميع مصادر المحاكاة المصرح بها…</p> : catalogError ? <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><CircleAlert className="h-4 w-4 shrink-0" />تعذر قراءة فهرس الموظفين للمحاكاة. لم تتغير أي بيانات مالية.</div><Button type="button" size="sm" variant="outline" onClick={() => void catalog.refetch()} className="border-amber-300 text-amber-900 hover:bg-amber-100 hover:text-amber-900"><RefreshCw className="ml-1 h-3.5 w-3.5" />إعادة المحاولة</Button></div> : catalogEntries.length && !employeeId ? <div className="mt-4 flex items-center gap-2 rounded-2xl border border-[#b9d8ca] bg-white/75 p-4 text-xs text-[#285544]"><RefreshCw className="h-4 w-4 shrink-0 animate-spin text-[#0f766e]" />جارٍ اختيار الموظف ذي الهيكل الساري للمحاكاة…</div> : sourceReady ? <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-[#b9d8ca] bg-white/75 p-4 text-xs text-[#285544] sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><Link2 className="h-4 w-4 shrink-0 text-[#0f766e]" />متصل بهيكل راتب ساري منذ {new Date(simulationInputs.data?.salary?.effectiveFrom ?? "").toLocaleDateString("ar-EG")}. أي تعديل في الحقول محلي لهذه المحاكاة فقط.</div><Button type="button" size="sm" variant="outline" onClick={applyStructureValues} className="border-[#9ed1bc] text-[#0f766e] hover:bg-[#eaf7f0] hover:text-[#0f766e]"><RefreshCw className="ml-1 h-3.5 w-3.5" />استعادة قيم الهيكل</Button></div> : employeeId ? <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><CircleAlert className="h-4 w-4 shrink-0" />لا يوجد هيكل راتب ساري لهذا الموظف في الفترة؛ أدخل قيماً يدوياً للمحاكاة فقط أو اضبط هيكلاً ساريًا.</div><a href="#salary-structures" className="font-bold text-[#9a5a00] underline underline-offset-4">الذهاب إلى هياكل الرواتب</a></div> : <div className="mt-4 rounded-2xl border border-dashed border-[#b9d8ca] bg-white/70 p-4 text-sm text-slate-600">لا يوجد موظف نشط متاح في هذا الفرع للمحاكاة.</div>}

        {!catalog.isLoading && employeeId && !selectedReport ? <div className="mt-5 rounded-2xl border border-dashed border-[#b9d8ca] bg-white/75 p-4 text-sm text-slate-600">لا توجد ورديات أو سجلات حضور كافية لهذا الموظف في الفترة المختارة؛ ستظل نتيجة الهيكل والتعديلات المعتمدة مرئية فقط.</div> : null}

        {employeeId ? <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><ScenarioMetric label="درجة الالتزام" value={selectedReport ? `${selectedReport.summary.complianceScore.toFixed(1)}٪` : "—"} /><ScenarioMetric label="مكافآت تقديرية" value={displayMoney(scenario.rewards)} tone="good" /><ScenarioMetric label="خصومات تقديرية" value={displayMoney(scenario.penalties)} tone="alert" /><ScenarioMetric label="صافي تقديري" value={displayMoney(scenario.estimatedNet)} tone="good" /></div>
          {scenario.rows.length ? <div className="mt-5 divide-y divide-[#d8e9e0] overflow-x-auto rounded-2xl border border-[#cce3d8] bg-white/85 px-4"><div className="grid min-w-[540px] grid-cols-[1.4fr_.8fr_.65fr_.7fr] gap-2 py-3 text-[11px] font-bold text-slate-500"><span>القاعدة</span><span>البيان</span><span>الوحدات</span><span>الأثر</span></div>{scenario.rows.map(row => <div key={row.id} className="grid min-w-[540px] grid-cols-[1.4fr_.8fr_.65fr_.7fr] gap-2 py-3 text-xs"><div><p className="font-bold text-[#17344a]">{row.name}</p><p className="mt-1 text-[10px] text-slate-500">{row.requiresApproval === "yes" ? "يتطلب اعتماداً قبل الإدراج" : "قاعدة دون اعتماد إضافي"}</p></div><span className="text-slate-600">{scenarioMetricLabels[row.metric]}: {row.metricValue}</span><span className="text-slate-600">{row.qualifyingUnits}</span><span className={row.adjustmentType === "reward" ? "font-extrabold text-[#0f766e]" : "font-extrabold text-[#b42318]"}>{row.adjustmentType === "reward" ? "+" : "−"}{displayMoney(row.amount)}</span></div>)}</div> : <div className="mt-5 flex gap-3 rounded-2xl border border-[#b9d8ca] bg-white/75 p-4 text-sm text-slate-600"><ShieldCheck className="h-5 w-5 shrink-0 text-[#0f766e]" />لا توجد قاعدة نشطة منطبقة على سجلات الحضور المتاحة لهذا الموظف في الفترة المحددة.</div>}
          {scenario.approvedAdjustments.length ? <div className="mt-4 rounded-2xl border border-[#cce3d8] bg-white/85 p-4"><p className="text-xs font-extrabold text-[#17344a]">تعديلات معتمدة وغير مدرجة في مسير</p><div className="mt-3 space-y-2">{scenario.approvedAdjustments.map(adjustment => <div key={adjustment.id} className="flex items-center justify-between gap-3 text-xs"><span className="text-slate-600">{adjustment.description} · {adjustment.source === "manual" ? "تعديل يدوي" : "قاعدة تلقائية"}</span><span className={adjustment.adjustmentType === "reward" ? "font-extrabold text-[#0f766e]" : "font-extrabold text-[#b42318]"}>{adjustment.adjustmentType === "reward" ? "+" : "−"}{displayMoney(Number(adjustment.amount))}</span></div>)}</div></div> : null}
          <div className="mt-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-900"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />هذه قراءة تقديرية مساندة للاعتماد، وليست كشف راتب أو قرار خصم. راجع القواعد والسياسات المحاسبية والعمل المحلية قبل اعتماد أي مسير فعلي.</div>
        </> : null}
      </CardContent>
    </Card>
  );
}

function SourceStat({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string; detail: string; tone: "teal" | "amber" | "slate" }) {
  const palette = tone === "teal" ? "border-[#cce3d8] bg-white/80 text-[#0f766e]" : tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-white/80 text-slate-700";
  return <div className={`rounded-2xl border p-3 ${palette}`}><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/80 [&>svg]:h-4 [&>svg]:w-4">{icon}</span><p className="text-xs font-bold opacity-80">{label}</p></div><p className="mt-3 text-base font-extrabold">{value}</p><p className="mt-1 text-[11px] opacity-75">{detail}</p></div>;
}

function ScenarioMetric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "good" | "alert" | "neutral" }) {
  const className = tone === "good" ? "bg-[#e6f5ef] text-[#0f766e]" : tone === "alert" ? "bg-[#fff1f1] text-[#b42318]" : "bg-white text-[#17344a]";
  return <div className={`rounded-2xl border border-white/80 p-4 shadow-sm ${className}`}><p className="text-xs font-bold opacity-75">{label}</p><p className="mt-2 text-lg font-extrabold">{value}</p></div>;
}
