export function getSaveFailureMessage(error: unknown, fallback = "تعذر إتمام الحفظ. حاول مجدداً.") {
  const rawMessage = error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message ?? "").trim()
    : "";

  if (/abort|timeout|timed out|network/i.test(rawMessage)) {
    return "انتهت مهلة الاتصال. تحقق من الشبكة ثم أعد المحاولة.";
  }

  // تُعرض الرسائل العربية التي جهزها الخادم فقط؛ وتُخفى تفاصيل الشبكة وقاعدة البيانات.
  if (/[\u0600-\u06FF]/.test(rawMessage)) return rawMessage;

  return fallback;
}
