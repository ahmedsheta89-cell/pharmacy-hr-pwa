import "./index.css";
import { createStartupDiagnostic } from "./lib/startup-diagnostics";

function reportStartupFailure(error: unknown) {
  const diagnostic = createStartupDiagnostic(error);
  const incidentId = typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID().replace(/-/g, "")
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
  const payload = JSON.stringify({ ...diagnostic, incidentId });

  try {
    if (navigator.sendBeacon?.("/api/startup-diagnostic", new Blob([payload], { type: "application/json" }))) return { diagnostic, incidentId };
  } catch {
    // Reporting must never prevent the recovery screen from rendering.
  }

  try {
    if (typeof globalThis.fetch === "function") {
      void globalThis.fetch("/api/startup-diagnostic", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => undefined);
    }
  } catch {
    // Reporting is best-effort only.
  }
  return { diagnostic, incidentId };
}

function renderStartupFallback(error: unknown) {
  const { diagnostic, incidentId } = reportStartupFailure(error);
  console.error("[App Startup Error]", error);
  const root = document.getElementById("root");
  if (!root) return;
  document.getElementById("startup-shell")?.remove();
  root.innerHTML = `<main dir="rtl" style="min-height:100vh;display:grid;place-items:center;padding:24px;background:#f4f7f5;color:#17344a;font-family:system-ui,sans-serif;text-align:center"><section style="max-width:32rem"><h1 style="font-size:24px;margin:0">تعذر بدء المنصة</h1><p style="margin:12px 0 20px;line-height:1.8;color:#5f6f68">حاول إعادة تحميل الصفحة. إذا استمرت المشكلة، استخدم آخر إصدار من المتصفح أو تواصل مع الإدارة.</p><p style="margin:0 0 18px;color:#6b7280;font-size:12px">رمز التشخيص: ${diagnostic.code} · ${incidentId.slice(0, 12)}</p><button type="button" onclick="window.location.reload()" style="border:0;border-radius:12px;background:#0f766e;color:white;padding:12px 18px;font-weight:700;cursor:pointer">إعادة تحميل الصفحة</button></section></main>`;
}

void import("./bootstrap").then(({ bootstrapApp }) => {
  return bootstrapApp();
}).catch(renderStartupFallback);
