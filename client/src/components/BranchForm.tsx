import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type BranchFormValues = { name: string; code: string; address?: string };

const fieldClass = "mt-1 h-10 rounded-xl border-[#d7e6df] bg-white text-[#17344a] focus-visible:ring-[#0f766e]";

export function BranchForm({ error, submitting, onSubmit }: { error?: string | null; submitting: boolean; onSubmit: (values: BranchFormValues) => void }) {
  const [validationError, setValidationError] = useState<string | null>(null);
  const visibleError = validationError || error;

  return <form noValidate onSubmit={event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") || "").trim();
    const code = String(data.get("code") || "").trim();
    if (!name) return setValidationError("أدخل اسم الفرع أولاً.");
    if (!code) return setValidationError("أدخل كوداً للفرع؛ يمكن أن يكون رقماً واحداً مثل 1.");
    setValidationError(null);
    onSubmit({ name, code, address: String(data.get("address") || "").trim() || undefined });
  }} className="grid gap-3 sm:grid-cols-3">
    <label><span className="text-xs font-bold">اسم الفرع</span><Input name="name" aria-invalid={Boolean(visibleError)} className={fieldClass} /></label>
    <label><span className="text-xs font-bold">الكود</span><Input name="code" aria-invalid={Boolean(visibleError)} placeholder="1 أو CAIRO-01" className={fieldClass} /><span className="mt-1 block text-[11px] text-slate-500">يمكن استخدام رقم أو رمز تشغيلي مختصر.</span></label>
    <label><span className="text-xs font-bold">العنوان</span><Input name="address" className={fieldClass} /></label>
    {visibleError ? <p role="alert" className="sm:col-span-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{visibleError}</p> : null}
    <Button disabled={submitting} className="sm:col-span-3 sm:w-fit">{submitting ? "جارٍ الحفظ..." : "حفظ الفرع"}</Button>
  </form>;
}
