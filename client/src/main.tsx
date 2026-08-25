import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import PwaUpdatePrompt from "./components/PwaUpdatePrompt";
import { startLogin } from "./const";
import { fetchWithTimeout } from "./lib/fetchWithTimeout";
import { recordApiRequest, startPerformanceMonitor } from "./lib/performanceMonitor";
import "./index.css";

const queryClient = new QueryClient();

function renderStartupFallback(error: unknown) {
  console.error("[App Startup Error]", error);
  const root = document.getElementById("root");
  if (!root) return;
  root.innerHTML = `<main dir="rtl" style="min-height:100vh;display:grid;place-items:center;padding:24px;background:#f4f7f5;color:#17344a;font-family:system-ui,sans-serif;text-align:center"><section style="max-width:32rem"><h1 style="font-size:24px;margin:0">تعذر بدء المنصة</h1><p style="margin:12px 0 20px;line-height:1.8;color:#5f6f68">حاول إعادة تحميل الصفحة. إذا استمرت المشكلة، استخدم آخر إصدار من المتصفح أو تواصل مع الإدارة.</p><button type="button" onclick="window.location.reload()" style="border:0;border-radius:12px;background:#0f766e;color:white;padding:12px 18px;font-weight:700;cursor:pointer">إعادة تحميل الصفحة</button></section></main>`;
}

try {
  startPerformanceMonitor();
} catch (error) {
  // Metrics are optional. Keep the application usable if the browser exposes
  // a partial performance API.
  console.warn("[Performance Monitor] تعذر البدء", error);
}

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  startLogin();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        // Preview auto-login fallback: when the browser blocks iframe cookies
        // (Safari ITP / private browsing / WebView), the runtime mirrors the
        // session into sessionStorage so we can forward it as a Bearer token.
        // The regular OAuth cookie flow keeps working and takes priority server-side.
        try {
          const raw = sessionStorage.getItem("manus-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            if (token) {
              return { Authorization: `Bearer ${token}` };
            }
          }
        } catch {
          // sessionStorage unavailable
        }
        return {};
      },
      async fetch(input, init) {
        const startedAt = performance.now();
        try {
          const response = await fetchWithTimeout(globalThis.fetch, input, {
            ...(init ?? {}),
            credentials: "include",
          });
          recordApiRequest(performance.now() - startedAt, response.ok);
          return response;
        } catch (error) {
          recordApiRequest(performance.now() - startedAt, false);
          throw error;
        }
      },
    }),
  ],
});

try {
  const root = document.getElementById("root");
  if (!root) throw new Error("لم يتم العثور على عنصر بدء التطبيق");
  createRoot(root).render(
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <App />
        <PwaUpdatePrompt />
      </QueryClientProvider>
    </trpc.Provider>
  );
} catch (error) {
  renderStartupFallback(error);
}

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then(registration => {
      const announceUpdate = () => window.dispatchEvent(new CustomEvent("pwa:update-available", { detail: { registration } }));
      if (registration.waiting) announceUpdate();
      registration.addEventListener("updatefound", () => {
        registration.installing?.addEventListener("statechange", () => {
          if (registration.installing?.state === "installed" && navigator.serviceWorker.controller) announceUpdate();
        });
      });
    }).catch(error => console.warn("[PWA] تعذر تسجيل عامل الخدمة", error));
  });
}
