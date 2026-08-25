class BootstrapStageError extends Error {
  constructor(stage: string) {
    super(`BOOTSTRAP_STAGE:${stage}`);
    this.name = "BootstrapStageError";
  }
}

async function loadStage<T>(stage: string, loader: () => Promise<T>) {
  try {
    return await loader();
  } catch {
    throw new BootstrapStageError(stage);
  }
}

function safeNow() {
  try {
    return typeof globalThis.performance?.now === "function" ? globalThis.performance.now() : Date.now();
  } catch {
    return Date.now();
  }
}

export async function bootstrapApp() {
  const react = await loadStage("REACT", () => import("react"));
  const reactDom = await loadStage("REACT_DOM", () => import("react-dom/client"));
  const reactQuery = await loadStage("REACT_QUERY", () => import("@tanstack/react-query"));
  const trpcModule = await loadStage("TRPC", () => import("@/lib/trpc"));
  const trpcClientModule = await loadStage("TRPC_CLIENT", () => import("@trpc/client"));
  const superjsonModule = await loadStage("SUPERJSON", () => import("superjson"));
  const constants = await loadStage("CONSTANTS", () => import("@shared/const"));
  const appModule = await loadStage("APP_MODULE", () => import("./App"));
  const pwaModule = await loadStage("PWA_PROMPT", () => import("./components/PwaUpdatePrompt"));
  const loginModule = await loadStage("LOGIN", () => import("./const"));
  const timeoutModule = await loadStage("FETCH_TIMEOUT", () => import("./lib/fetchWithTimeout"));
  const monitorModule = await loadStage("PERFORMANCE_MONITOR", () => import("./lib/performanceMonitor"));

  const { QueryClient, QueryClientProvider } = reactQuery;
  const { trpc } = trpcModule;
  const { httpBatchLink, TRPCClientError } = trpcClientModule;
  const { default: superjson } = superjsonModule;
  const { COOKIE_NAME, UNAUTHED_ERR_MSG } = constants;
  const App = appModule.default;
  const PwaUpdatePrompt = pwaModule.default;
  const { startLogin } = loginModule;
  const { fetchWithTimeout } = timeoutModule;
  const { recordApiRequest, startPerformanceMonitor } = monitorModule;
  const queryClient = new QueryClient();
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

  try {
    startPerformanceMonitor();
  } catch (error) {
    console.warn("[Performance Monitor] تعذر البدء", error);
  }

  const root = document.getElementById("root");
  if (!root) throw new BootstrapStageError("ROOT");

  try {
    const appContent = react.createElement(
      QueryClientProvider,
      {
        client: queryClient,
        children: react.createElement(
          react.Fragment,
          null,
          react.createElement(App),
          react.createElement(PwaUpdatePrompt),
        ),
      },
    );
    reactDom.createRoot(root).render(
      react.createElement(
        trpc.Provider,
        { client: trpcClient, queryClient, children: appContent },
      ),
    );
  } catch {
    throw new BootstrapStageError("RENDER");
  }

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
