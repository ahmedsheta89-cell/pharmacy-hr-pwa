import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getPerformanceSnapshot, subscribePerformance, type PerformanceSnapshot } from "@/lib/performanceMonitor";

function formatMetric(value: number | null) {
  return value == null ? "—" : `${Math.round(value)}ms`;
}

export function PerformanceStatus() {
  const [metrics, setMetrics] = useState<PerformanceSnapshot>(() => getPerformanceSnapshot());
  useEffect(() => subscribePerformance(setMetrics), []);
  const slowServer = (metrics.ttfbMs ?? 0) > 3_000;
  const slowContent = (metrics.lcpMs ?? 0) > 4_000;
  const slowApi = (metrics.averageApiMs ?? 0) > 1_000;
  const hasIssue = metrics.apiFailures > 0 || slowServer || slowContent || slowApi;
  const issueText = metrics.apiFailures > 0 ? "حدث فشل في بعض طلبات التطبيق خلال هذه الجلسة." : slowServer ? "الاستجابة الأولى للخادم تجاوزت الحد التشغيلي لهذه الجلسة." : slowContent ? "عرض المحتوى الرئيسي تأخر عن الحد التشغيلي لهذه الجلسة." : slowApi ? "متوسط طلبات التطبيق تجاوز الحد التشغيلي لهذه الجلسة." : null;

  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button aria-label="مؤشرات أداء الجلسة" className={`grid h-9 w-9 place-items-center rounded-full border bg-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e] ${hasIssue ? "border-amber-300 text-amber-700" : "border-[#dbe9e2] text-[#0f766e] hover:bg-[#eaf4ef]"}`}>
        <Activity className="h-4 w-4" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-64 rounded-2xl p-2 text-right">
      <DropdownMenuLabel className="px-2 text-xs text-slate-500">أداء هذه الجلسة</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <div className="grid grid-cols-2 gap-2 px-2 py-2 text-xs">
        <Metric label="استجابة الخادم" value={formatMetric(metrics.ttfbMs)} />
        <Metric label="أول محتوى" value={formatMetric(metrics.fcpMs)} />
        <Metric label="أكبر محتوى" value={formatMetric(metrics.lcpMs)} />
        <Metric label="متوسط API" value={formatMetric(metrics.averageApiMs)} />
        <Metric label="طلبات API" value={String(metrics.apiRequests)} />
        <Metric label="فشل الطلبات" value={String(metrics.apiFailures)} alert={metrics.apiFailures > 0} />
      </div>
      {issueText ? <p role="status" className="mx-2 mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">{issueText}</p> : null}
      <p className="px-2 pb-1 text-[10px] leading-4 text-slate-400">تُعرض القياسات محلياً لهذه الجلسة فقط ولا تُرسل بيانات عمل أو موقع.</p>
    </DropdownMenuContent>
  </DropdownMenu>;
}

function Metric({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) {
  return <div className="rounded-xl bg-slate-50 px-2 py-2"><p className="text-[10px] text-slate-500">{label}</p><p className={`mt-1 font-extrabold ${alert ? "text-rose-600" : "text-[#17344a]"}`}>{value}</p></div>;
}
