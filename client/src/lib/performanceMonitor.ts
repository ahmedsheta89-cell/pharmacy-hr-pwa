export type PerformanceSnapshot = {
  ttfbMs: number | null;
  fcpMs: number | null;
  lcpMs: number | null;
  apiRequests: number;
  apiFailures: number;
  averageApiMs: number | null;
  slowestApiMs: number | null;
  longTasks: number;
};

const initialSnapshot = (): PerformanceSnapshot => ({
  ttfbMs: null,
  fcpMs: null,
  lcpMs: null,
  apiRequests: 0,
  apiFailures: 0,
  averageApiMs: null,
  slowestApiMs: null,
  longTasks: 0,
});

let snapshot = initialSnapshot();
const listeners = new Set<(value: PerformanceSnapshot) => void>();

function publish() {
  const value = { ...snapshot };
  listeners.forEach(listener => listener(value));
}

function setMetric(metric: Partial<PerformanceSnapshot>) {
  snapshot = { ...snapshot, ...metric };
  publish();
}

export function getPerformanceSnapshot() {
  return { ...snapshot };
}

export function subscribePerformance(listener: (value: PerformanceSnapshot) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function recordApiRequest(durationMs: number, ok: boolean) {
  const apiRequests = snapshot.apiRequests + 1;
  const averageApiMs = ((snapshot.averageApiMs ?? 0) * snapshot.apiRequests + durationMs) / apiRequests;
  setMetric({
    apiRequests,
    apiFailures: snapshot.apiFailures + (ok ? 0 : 1),
    averageApiMs,
    slowestApiMs: Math.max(snapshot.slowestApiMs ?? 0, durationMs),
  });
}

export function resetPerformanceSnapshot() {
  snapshot = initialSnapshot();
  publish();
}

export function startPerformanceMonitor() {
  if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") return () => undefined;

  const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (navigation) setMetric({ ttfbMs: Math.max(0, navigation.responseStart - navigation.requestStart) });

  const observers: PerformanceObserver[] = [];
  const observe = (type: string, callback: (entries: PerformanceEntry[]) => void) => {
    try {
      const observer = new PerformanceObserver(list => callback(list.getEntries()));
      observer.observe({ type, buffered: true });
      observers.push(observer);
    } catch {
      // The browser does not expose every performance entry type.
    }
  };

  observe("paint", entries => {
    const fcp = entries.find(entry => entry.name === "first-contentful-paint");
    if (fcp) setMetric({ fcpMs: fcp.startTime });
  });
  observe("largest-contentful-paint", entries => {
    const latest = entries.at(-1);
    if (latest) setMetric({ lcpMs: latest.startTime });
  });
  observe("longtask", entries => setMetric({ longTasks: snapshot.longTasks + entries.length }));

  return () => observers.forEach(observer => observer.disconnect());
}
