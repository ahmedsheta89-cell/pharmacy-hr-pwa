import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/_core/hooks/useAuth";
import { CheckCircle2, ClipboardCheck, ShieldCheck } from "lucide-react";

const scenarios = [
  { role: "المالك", goal: "إدارة تشغيل الفروع والرواتب والأداء العام.", steps: ["إضافة فرع وملف موظف", "فتح الرواتب وإصدار مسير شهري", "تصدير المسير إلى Excel وPDF", "إصدار رمز QR للحضور من محطة الفرع"] },
  { role: "مدير الفرع", goal: "تنظيم فريق الفرع والحضور والوردية والطلبات.", steps: ["اختيار الفرع المخوّل", "إنشاء وردية وإسنادها", "مراجعة طلب إجازة معلّق", "إصدار رمز QR للفريق"] },
  { role: "الصيدلاني", goal: "استخدام البوابة الذاتية دون الوصول للرواتب أو بيانات الفريق.", steps: ["فتح وردية اليوم", "مسح رمز QR لتسجيل الحضور", "تقديم طلب إجازة", "مراجعة مؤشر الأداء الشخصي"] },
  { role: "الموظف", goal: "متابعة جدول العمل والالتزام والطلبات الشخصية فقط.", steps: ["عرض جدول الفترة", "مسح رمز QR للحضور أو الانصراف", "عرض رصيد الإجازة", "التأكد من عدم ظهور وحدتي الموظفين والرواتب"] },
];

export default function RoleScenarios() {
  const { user } = useAuth();
  const owner = user?.role === "admin" || user?.role === "owner";
  return <DashboardLayout>{owner ? <div className="space-y-6" dir="rtl"><section className="rounded-[1.75rem] border border-[#dce9e2] bg-white p-6 shadow-[0_18px_42px_-34px_rgba(23,52,74,.45)]"><Badge className="border-0 bg-[#e6f5ef] text-[#0f766e] hover:bg-[#e6f5ef]">ضبط الجودة</Badge><h2 className="mt-3 text-2xl font-extrabold tracking-tight text-[#17344a]">سيناريوهات اعتماد الأدوار</h2><p className="mt-2 max-w-3xl text-sm leading-7 text-slate-500">استخدم هذه القائمة مع حساب منفصل لكل دور. لا تتضمن السيناريوهات بيانات وهمية أو صلاحيات متجاوزة؛ بل توضح مسار التحقق المطلوب عند تهيئة الحسابات الفعلية.</p></section><div className="grid gap-5 lg:grid-cols-2">{scenarios.map(scenario => <Card key={scenario.role} className="border-[#e1ece6] bg-white"><CardContent className="p-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#e6f5ef] text-[#0f766e]"><ShieldCheck className="h-5 w-5" /></span><div><h3 className="font-extrabold text-[#17344a]">{scenario.role}</h3><p className="mt-1 text-xs text-slate-500">{scenario.goal}</p></div></div><ol className="mt-5 space-y-3">{scenario.steps.map((step, index) => <li key={step} className="flex gap-3 text-sm text-slate-600"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#e6f5ef] text-[11px] font-bold text-[#0f766e]">{index + 1}</span>{step}</li>)}</ol></CardContent></Card>)}</div><Card className="border-[#cce3d8] bg-[#f8fcfa]"><CardContent className="flex gap-3 p-5 text-sm leading-7 text-slate-600"><ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#0f766e]" />دوّن نتيجة كل سيناريو في عملية الاستلام؛ وتأكد من أن رمز QR صالح لفرع الموظف وتنتهي صلاحيته بعد 10 دقائق، ثم راجع ملف التصدير قبل اعتماد مسير الرواتب.</CardContent></Card></div> : <div className="grid min-h-72 place-items-center p-6 text-center"><div><CheckCircle2 className="mx-auto h-8 w-8 text-[#0f766e]" /><p className="mt-3 font-bold text-[#17344a]">هذه الصفحة مخصصة للمالك فقط.</p></div></div>}</DashboardLayout>;
}
