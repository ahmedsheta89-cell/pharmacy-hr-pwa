export function getPayrollDeliveryReadiness(status: string) {
  if (status === "paid") return { ready: true, label: "تم الصرف", description: "تم صرف هذا الكشف ويمكن الرجوع إلى ملفه المصدر عند الحاجة." };
  if (status === "approved") return { ready: true, label: "جاهز للتنزيل", description: "الكشف معتمد وجاهز للتصدير والتنزيل اليدوي من صفحة الرواتب." };
  if (status === "rejected") return { ready: false, label: "مرفوض", description: "لا يمكن تجهيز الكشف قبل معالجة سبب الرفض وإعادة المسير للاعتماد." };
  return { ready: false, label: "بانتظار الاعتماد", description: "سيصبح الكشف جاهزاً بعد اكتمال الاعتماد متعدد المراحل." };
}
