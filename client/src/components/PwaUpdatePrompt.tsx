import { RefreshCw, Wifi } from "lucide-react";
import React from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type UpdateEvent = Event & { detail?: { registration?: ServiceWorkerRegistration } };

export default function PwaUpdatePrompt() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [visible, setVisible] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const onUpdate = (event: Event) => {
      const updateEvent = event as UpdateEvent;
      setRegistration(updateEvent.detail?.registration ?? null);
      setVisible(true);
    };
    window.addEventListener("pwa:update-available", onUpdate);
    return () => window.removeEventListener("pwa:update-available", onUpdate);
  }, []);

  const applyUpdate = () => {
    setIsUpdating(true);
    if (!registration?.waiting || !("serviceWorker" in navigator)) {
      window.location.reload();
      return;
    }

    let refreshed = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshed) {
        refreshed = true;
        window.location.reload();
      }
    }, { once: true });
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
  };

  if (!visible) return null;

  return (
    <aside dir="rtl" aria-live="polite" className="safe-area-top fixed inset-x-3 top-2 z-50 mx-auto w-auto max-w-md rounded-2xl border border-[#b9d8ca] bg-white/95 p-3 shadow-[0_18px_48px_-22px_rgba(15,118,110,.55)] backdrop-blur-xl sm:inset-x-auto sm:right-5 sm:left-auto">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e6f5ef] text-[#0f766e]"><Wifi className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-[#17344a]">يتوفر تحديث جديد</p>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">حدّث الآن للحصول على أحدث التحسينات بأمان.</p>
        </div>
        <Button size="sm" onClick={applyUpdate} disabled={isUpdating} className="touch-target h-10 shrink-0 rounded-xl bg-[#0f766e] px-3 text-xs font-bold hover:bg-[#0b5c56]">
          <RefreshCw className={`ml-1 h-3.5 w-3.5 ${isUpdating ? "animate-spin" : ""}`} />{isUpdating ? "جارٍ التحديث" : "تحديث الآن"}
        </Button>
      </div>
    </aside>
  );
}
