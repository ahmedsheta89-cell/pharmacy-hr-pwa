import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import {
  ArrowUpLeft,
  BarChart3,
  BellRing,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileText,
  HandCoins,
  HeartPulse,
  Pill,
  Plus,
  ReceiptText,
  TrendingUp,
  UsersRound,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect } from "react";
import { saveOfflineDashboardSnapshot } from "@/lib/offlineSnapshot";

type AppRole = "owner" | "manager" | "pharmacist" | "employee";
type Stat = { label: string; value: string; hint: string; icon: LucideIcon; tint: string };
type QuickAction = { icon: LucideIcon; title: string; description: string; path: string };
type RoleConfig = { badge: string; title: string; description: string; primaryAction: string; primaryPath: string; secondaryAction: string; secondaryPath: string; stats: Stat[]; focusTitle: string; focusText: string; focusIcon: LucideIcon; alertsTitle: string; alertsText: string; quickTitle: string; quickDescription: string; actions: QuickAction[] };

export function normalizeDashboardRole(role?: string): AppRole {
  if (role === "admin" || role === "owner") return "owner";
  if (role === "manager" || role === "pharmacist") return role;
  return "employee";
}

export const roleDashboardConfigs: Record<AppRole, RoleConfig> = {
  owner: {
    badge: "رؤية شاملة للأعمال",
    title: "قيادة أعمال الصيدلية من لوحة واحدة.",
    description: "اطّلع على جاهزية الفروع، التزام الفرق، الأداء المالي، وحالة مسيرات الرواتب قبل اعتماد القرارات.",
    primaryAction: "إدارة الفريق",
    primaryPath: "/employees",
    secondaryAction: "مراجعة الرواتب",
    secondaryPath: "/payroll",
    stats: [
      { label: "الفروع النشطة", value: "0", hint: "أضف أول فرع للبدء", icon: Building2, tint: "bg-[#e5f5ef] text-[#0f766e]" },
      { label: "فريق العمل", value: "0", hint: "لا توجد ملفات موظفين", icon: UsersRound, tint: "bg-[#eaf0ff] text-[#4967b5]" },
      { label: "الأداء العام", value: "—", hint: "يتطلب إدخال مؤشرات الأداء", icon: TrendingUp, tint: "bg-[#fff3db] text-[#b87516]" },
      { label: "مسير الرواتب", value: "مسودة", hint: "يُنشأ عند اكتمال البيانات", icon: WalletCards, tint: "bg-[#f3eafe] text-[#8b52b8]" },
    ],
    focusTitle: "تحليل أداء الفروع",
    focusText: "ستظهر مقارنة الفروع والتكاليف والأداء فور تفعيل الفروع وإدخال مؤشرات القياس.",
    focusIcon: BarChart3,
    alertsTitle: "اعتمادات المالك",
    alertsText: "ستظهر هنا طلبات الاعتماد المهمة مثل مسيرات الرواتب وتعديلات سياسات العمل.",
    quickTitle: "الخطوات الأولى للمالك",
    quickDescription: "جهّز الهيكل التشغيلي قبل بدء المتابعة اليومية.",
    actions: [
      { icon: Building2, title: "إضافة فرع", description: "عرّف موقع العمل ومعلومات التشغيل.", path: "/employees" },
      { icon: UsersRound, title: "بناء الفريق", description: "أضف ملفات العاملين والأدوار.", path: "/employees" },
      { icon: HandCoins, title: "ضبط الرواتب", description: "حدّد هيكل الأجر والمكافآت.", path: "/payroll" },
    ],
  },
  manager: {
    badge: "تشغيل الفرع اليومي",
    title: "ابقَ قريباً من نبض فريقك اليوم.",
    description: "راقب الحضور والورديات وطلبات الإجازة وسجلات الأداء اليومية لضمان استمرار الخدمة بسلاسة.",
    primaryAction: "متابعة الحضور",
    primaryPath: "/attendance",
    secondaryAction: "جدولة ورديات",
    secondaryPath: "/shifts",
    stats: [
      { label: "حضور الفريق", value: "—", hint: "لا توجد سجلات لليوم", icon: UsersRound, tint: "bg-[#e5f5ef] text-[#0f766e]" },
      { label: "ورديات اليوم", value: "0", hint: "أنشئ جدول الفرع أولاً", icon: CalendarClock, tint: "bg-[#eaf0ff] text-[#4967b5]" },
      { label: "طلبات الإجازة", value: "0", hint: "لا توجد طلبات معلقة", icon: ReceiptText, tint: "bg-[#fff3db] text-[#b87516]" },
      { label: "التزام الفريق", value: "—", hint: "يتحسب من سجلات الحضور", icon: CheckCircle2, tint: "bg-[#f3eafe] text-[#8b52b8]" },
    ],
    focusTitle: "تشغيل الفريق اليومي",
    focusText: "ستُجمع مؤشرات الحضور والتأخير والورديات تلقائياً بعد بدء استخدام السجلات اليومية.",
    focusIcon: Clock3,
    alertsTitle: "تنبيهات الفرع",
    alertsText: "سيعرض النظام طلبات الإجازة والتأخيرات وحالات نقص التغطية في الورديات هنا.",
    quickTitle: "إجراءات المدير",
    quickDescription: "نظّم يوم العمل ثم راقب الاستثناءات أولاً بأول.",
    actions: [
      { icon: CalendarClock, title: "جدولة الفريق", description: "وزّع ورديات الأسبوع أو الشهر.", path: "/shifts" },
      { icon: Clock3, title: "تدقيق الحضور", description: "راجع الدخول والخروج والتأخيرات.", path: "/attendance" },
      { icon: BarChart3, title: "متابعة الأداء", description: "سجّل وراجع مؤشرات الفريق.", path: "/kpis" },
    ],
  },
  pharmacist: {
    badge: "مساحة الصيدلاني",
    title: "خطط ورديتك وابقَ على هدفك.",
    description: "تابع تفاصيل ورديتك القادمة، سجل حضورك، وراقب تقدمك في أهداف المبيعات والالتزام المهني.",
    primaryAction: "تسجيل الحضور",
    primaryPath: "/attendance",
    secondaryAction: "عرض وردياتي",
    secondaryPath: "/shifts",
    stats: [
      { label: "وردية اليوم", value: "—", hint: "لم تُسند وردية بعد", icon: CalendarClock, tint: "bg-[#e5f5ef] text-[#0f766e]" },
      { label: "ساعات العمل", value: "—", hint: "تظهر مع التسجيل اليومي", icon: Clock3, tint: "bg-[#eaf0ff] text-[#4967b5]" },
      { label: "هدف المبيعات", value: "—", hint: "لم يُحدد هدف لهذا الشهر", icon: TrendingUp, tint: "bg-[#fff3db] text-[#b87516]" },
      { label: "رصيد الإجازة", value: "—", hint: "يظهر عند إعداد الرصيد", icon: ReceiptText, tint: "bg-[#f3eafe] text-[#8b52b8]" },
    ],
    focusTitle: "أداؤك الشخصي",
    focusText: "ستظهر أهداف المبيعات ومتوسط الفاتورة والالتزام فور أن يحددها المدير لدورك.",
    focusIcon: HeartPulse,
    alertsTitle: "ملاحظات ورديتك",
    alertsText: "ستظهر هنا أي تغييرات في الوردية أو تنبيهات مرتبطة بالحضور والمهام.",
    quickTitle: "خطواتك اليومية",
    quickDescription: "ثبّت الحضور، راجع جدولك، ثم تابع تقدّمك نحو الهدف.",
    actions: [
      { icon: Clock3, title: "تسجيل الحضور", description: "سجّل بداية أو نهاية ورديتك.", path: "/attendance" },
      { icon: CalendarClock, title: "وردية الأسبوع", description: "راجع جدول عملك القادم.", path: "/shifts" },
      { icon: TrendingUp, title: "مؤشرات أدائي", description: "اطّلع على أهدافك ونتائجك.", path: "/kpis" },
    ],
  },
  employee: {
    badge: "بوابتك الشخصية",
    title: "كل ما يخص يوم عملك في مكان واحد.",
    description: "تابع وردياتك، حضورك، رصيد إجازتك، وأهداف الأداء المحددة لك من دون الاطلاع على بيانات الآخرين.",
    primaryAction: "عرض وردياتي",
    primaryPath: "/shifts",
    secondaryAction: "طلب إجازة",
    secondaryPath: "/leaves",
    stats: [
      { label: "وردية اليوم", value: "—", hint: "لم تُسند وردية بعد", icon: CalendarClock, tint: "bg-[#e5f5ef] text-[#0f766e]" },
      { label: "حالة الحضور", value: "—", hint: "سجّل الحضور عند بدء العمل", icon: Clock3, tint: "bg-[#eaf0ff] text-[#4967b5]" },
      { label: "رصيد الإجازة", value: "—", hint: "يظهر بعد إنشاء ملفك", icon: ReceiptText, tint: "bg-[#fff3db] text-[#b87516]" },
      { label: "درجة الأداء", value: "—", hint: "ترتبط بالأهداف المسندة إليك", icon: CheckCircle2, tint: "bg-[#f3eafe] text-[#8b52b8]" },
    ],
    focusTitle: "تقدّمك نحو الهدف",
    focusText: "ستظهر هنا مؤشرات أدائك الشهرية وملاحظات المراجعة عند إضافتها من مدير الفرع.",
    focusIcon: Pill,
    alertsTitle: "تنبيهاتك الشخصية",
    alertsText: "ستصل تحديثات الوردية ونتائج طلبات الإجازة والتنبيهات المهمة إلى هذه المساحة.",
    quickTitle: "مساحتك الشخصية",
    quickDescription: "ابقَ على اطلاع بجدولك وحقوقك وخطط تطورك.",
    actions: [
      { icon: CalendarClock, title: "جدولي", description: "اعرض وردياتك القادمة.", path: "/shifts" },
      { icon: ReceiptText, title: "إجازاتي", description: "تابع الرصيد والطلبات.", path: "/leaves" },
      { icon: BarChart3, title: "أهدافي", description: "راجع مؤشرات أدائك الفردية.", path: "/kpis" },
    ],
  },
};

function QuickActionCard({ action, onClick }: { action: QuickAction; onClick: () => void }) {
  const Icon = action.icon;
  return <button onClick={onClick} className="group flex min-h-24 w-full items-center gap-3 rounded-2xl border border-[#e1ece6] bg-white p-4 text-right shadow-[0_12px_30px_-26px_rgba(23,52,74,.5)] transition hover:-translate-y-0.5 hover:border-[#9ccdb9] hover:shadow-[0_20px_34px_-24px_rgba(15,118,110,.4)] focus-visible:ring-2 focus-visible:ring-[#0f766e]"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e6f5ef] text-[#0f766e] transition group-hover:bg-[#0f766e] group-hover:text-white"><Icon className="h-5 w-5" /></span><span className="min-w-0"><span className="block text-sm font-extrabold text-[#17344a]">{action.title}</span><span className="mt-1 block text-xs text-slate-500">{action.description}</span></span></button>;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const config = roleDashboardConfigs[normalizeDashboardRole(user?.role)];
  const FocusIcon = config.focusIcon;
  const overviewQuery = trpc.dashboard.overview.useQuery(undefined, { retry: false });
  const dashboardStats = overviewQuery.data?.stats;

  useEffect(() => {
    if (user?.id == null || !dashboardStats?.length) return;
    saveOfflineDashboardSnapshot(user.id, dashboardStats.map((stat, index) => ({
      label: config.stats[index]?.label ?? "بيان أساسي",
      value: stat.value,
      hint: stat.hint,
    })));
  }, [config.stats, dashboardStats, user?.id]);

  return <div className="space-y-6" dir="rtl">
    <section className="relative overflow-hidden rounded-[1.75rem] bg-[#17344a] px-6 py-7 text-white shadow-[0_30px_60px_-36px_rgba(23,52,74,.72)] md:px-8 md:py-8"><div className="relative z-10 flex flex-col justify-between gap-7 lg:flex-row lg:items-end"><div className="max-w-2xl"><Badge className="border-0 bg-white/10 px-3 py-1 text-[#a7ebcf] hover:bg-white/10">{config.badge}</Badge><h2 className="mt-4 text-2xl font-extrabold tracking-tight md:text-3xl">{config.title}</h2><p className="mt-3 max-w-xl text-sm leading-7 text-slate-300">{config.description}</p></div><div className="flex flex-wrap gap-3"><Button onClick={() => setLocation(config.primaryPath)} className="h-11 rounded-xl bg-[#9ee4c9] px-5 font-bold text-[#123c35] hover:bg-[#c1efd9]"><Plus className="ml-2 h-4 w-4" />{config.primaryAction}</Button><Button variant="outline" onClick={() => setLocation(config.secondaryPath)} className="h-11 rounded-xl border-white/20 bg-white/5 px-5 font-bold text-white hover:bg-white/15 hover:text-white">{config.secondaryAction}</Button></div></div><div className="pointer-events-none absolute -ml-16 -mt-44 h-72 w-72 rounded-full bg-[#0f766e]/30 blur-3xl" /></section>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{config.stats.map((stat, index) => { const liveStat = dashboardStats?.[index]; return <Card key={stat.label} className="border-[#e1ece6] bg-white py-0 shadow-[0_14px_36px_-30px_rgba(23,52,74,.55)]"><CardContent className="p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-bold text-slate-500">{stat.label}</p><p className="mt-2 text-2xl font-extrabold tracking-tight text-[#17344a]">{overviewQuery.isLoading ? "…" : liveStat?.value ?? stat.value}</p></div><span className={`grid h-10 w-10 place-items-center rounded-xl ${stat.tint}`}><stat.icon className="h-5 w-5" /></span></div><p className="mt-4 text-xs text-slate-400">{liveStat?.hint ?? stat.hint}</p></CardContent></Card>; })}</section>

    <section className="grid gap-6 xl:grid-cols-[1.45fr_.85fr]"><Card className="border-[#e1ece6] bg-white shadow-[0_14px_36px_-30px_rgba(23,52,74,.55)]"><CardContent className="p-6"><div className="flex items-center justify-between"><div><p className="text-sm font-extrabold text-[#17344a]">{config.focusTitle}</p><p className="mt-1 text-xs text-slate-500">تحديثات حية مرتبطة ببياناتك المصرح بها فقط.</p></div><button onClick={() => setLocation("/kpis")} className="flex items-center gap-1 text-xs font-bold text-[#0f766e]">عرض التفاصيل<ArrowUpLeft className="h-3.5 w-3.5" /></button></div><div className="mt-7 grid min-h-56 place-items-center rounded-2xl border border-dashed border-[#cbe1d6] bg-[#f8fbf9] px-6 text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#e6f5ef] text-[#0f766e]"><FocusIcon className="h-6 w-6" /></span><p className="mt-4 text-sm font-extrabold text-[#17344a]">بيانات الأداء بانتظار التفعيل</p><p className="mt-1 max-w-md text-xs leading-5 text-slate-500">{config.focusText}</p></div></div></CardContent></Card><Card className="border-[#e1ece6] bg-white shadow-[0_14px_36px_-30px_rgba(23,52,74,.55)]"><CardContent className="p-6"><div className="flex items-center justify-between"><div><p className="text-sm font-extrabold text-[#17344a]">{config.alertsTitle}</p><p className="mt-1 text-xs text-slate-500">استثناءات تحتاج اهتمامك.</p></div><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#fff3db] text-[#b87516]"><CircleAlert className="h-4 w-4" /></span></div><div className="mt-6 rounded-2xl bg-[#fbfcfb] p-5 text-center"><BellRing className="mx-auto h-6 w-6 text-slate-300" /><p className="mt-3 text-sm font-bold text-[#17344a]">لا توجد تنبيهات حالياً</p><p className="mt-1 text-xs leading-5 text-slate-500">{config.alertsText}</p></div></CardContent></Card></section>

    <section><div className="mb-3"><h3 className="text-base font-extrabold text-[#17344a]">{config.quickTitle}</h3><p className="mt-1 text-xs text-slate-500">{config.quickDescription}</p></div><div className="grid gap-3 md:grid-cols-3">{config.actions.map(action => <QuickActionCard key={action.title} action={action} onClick={() => setLocation(action.path)} />)}</div></section>
  </div>;
}
