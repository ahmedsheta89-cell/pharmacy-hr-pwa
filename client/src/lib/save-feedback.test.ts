import { describe, expect, it } from "vitest";
import { getSaveFailureMessage } from "./save-feedback";

describe("رسائل فشل الحفظ الموحدة", () => {
  it("تعرض رسالة الخادم العربية الآمنة", () => {
    expect(getSaveFailureMessage({ message: "هذا الكود مستخدم بالفعل." })).toBe("هذا الكود مستخدم بالفعل.");
  });

  it("تخفي تفاصيل فشل الخادم التقنية", () => {
    expect(getSaveFailureMessage({ message: "ER_DUP_ENTRY: duplicate key" })).toBe("تعذر إتمام الحفظ. حاول مجدداً.");
  });

  it("توضح فشل المهلة بدلاً من إبقاء المستخدم في حالة انتظار", () => {
    expect(getSaveFailureMessage({ message: "Request timed out" })).toBe("انتهت مهلة الاتصال. تحقق من الشبكة ثم أعد المحاولة.");
  });
});
