export type OfflineDashboardStat = {
  label: string;
  value: string;
  hint: string;
};

export type OfflineDashboardSnapshot = {
  version: 1;
  userId: number | string;
  savedAt: number;
  stats: OfflineDashboardStat[];
};

export const OFFLINE_DASHBOARD_PREFIX = "pharmacy-hr:offline-dashboard:";
export const OFFLINE_DASHBOARD_LATEST_KEY = "pharmacy-hr:offline-dashboard:latest";
const MAX_SNAPSHOT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function storageAvailable() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function saveOfflineDashboardSnapshot(userId: number | string, stats: OfflineDashboardStat[]) {
  if (!storageAvailable() || !stats.length) return;

  const snapshot: OfflineDashboardSnapshot = {
    version: 1,
    userId,
    savedAt: Date.now(),
    stats: stats.slice(0, 4).map(stat => ({
      label: String(stat.label ?? ""),
      value: String(stat.value ?? "—"),
      hint: String(stat.hint ?? ""),
    })),
  };

  try {
    localStorage.setItem(`${OFFLINE_DASHBOARD_PREFIX}${userId}`, JSON.stringify(snapshot));
    localStorage.setItem(OFFLINE_DASHBOARD_LATEST_KEY, JSON.stringify({ userId, savedAt: snapshot.savedAt }));
  } catch {
    // Private browsing or a full device store should never block the live dashboard.
  }
}

export function readOfflineDashboardSnapshot(userId: number | string): OfflineDashboardSnapshot | null {
  if (!storageAvailable()) return null;
  try {
    const raw = localStorage.getItem(`${OFFLINE_DASHBOARD_PREFIX}${userId}`);
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as OfflineDashboardSnapshot;
    if (snapshot.version !== 1 || snapshot.userId !== userId || !Array.isArray(snapshot.stats)) return null;
    if (Date.now() - snapshot.savedAt > MAX_SNAPSHOT_AGE_MS) return null;
    return snapshot;
  } catch {
    return null;
  }
}

export function clearOfflineDashboardSnapshots() {
  if (!storageAvailable()) return;
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(OFFLINE_DASHBOARD_PREFIX) || key === OFFLINE_DASHBOARD_LATEST_KEY) localStorage.removeItem(key);
    }
  } catch {
    // Storage can be disabled by the browser; there is nothing to clear in that case.
  }
}
