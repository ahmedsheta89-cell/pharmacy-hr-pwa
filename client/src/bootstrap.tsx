import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from "@shared/const";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import PwaUpdatePrompt from "./components/PwaUpdatePrompt";
import { startLogin } from "./const";
import { fetchWithTimeout } from "./lib/fetchWithTimeout";
import { recordApiRequest, startPerformanceMonitor } from "./lib/performanceMonitor";

const queryClient = new QueryClient();

function safeNow() {
  try {
    return typeof globalThis.performance?.now === "function" ? globalThis.performance.now() : Date.now();
  } catch {
    return Date.now();
  }
}

const baseFetch = typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : undefined;

function redirectToLoginIfUnauthorized(error: unknown) {
  if (!(error instanceof TRPCClientError) || typeof window === "undefined") return;
  if (error.message === UNAUTHED_ERR_MSG) startLogin();
}

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
        try {
          const raw = sessionStorage.getItem("manus-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(value => value.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            if (token) return { Authorization: `Bearer ${token}` };
          }
        } catch {
          // The authenticated cookie remains the source of truth when storage is unavailable.
        }
        return {};
      },
      async fetch(input, init) {
        const startedAt = safeNow();
        try {
          if (!baseFetch) throw new Error("FETCH_UNAVAILABLE");
          const response = await fetchWithTimeout(baseFetch, input, { ...(init ?? {}), credentials: "include" });
          recordApiRequest(safeNow() - startedAt, response.ok);
          return response;
        } catch (error) {
          recordApiRequest(safeNow() - startedAt, false);
          throw error;
        }
      },
    }),
  ],
});

export function bootstrapApp() {
  try {
    startPerformanceMonitor();
  } catch (error) {
    console.warn("[Performance Monitor] تعذر البدء", error);
  }

  const root = document.getElementById("root");
  if (!root) throw new Error("لم يتم العثور على عنصر بدء التطبيق");

  createRoot(root).render(
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <App />
        <PwaUpdatePrompt />
      </QueryClientProvider>
    </trpc.Provider>,
  );
  document.getElementById("startup-shell")?.remove();

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
}
