// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearOfflineDashboardSnapshots,
  OFFLINE_DASHBOARD_LATEST_KEY,
  OFFLINE_DASHBOARD_PREFIX,
  readOfflineDashboardSnapshot,
  saveOfflineDashboardSnapshot,
} from "./offlineSnapshot";

describe("لقطة لوحة التحكم دون اتصال", () => {
  beforeEach(() => localStorage.clear());

  it("تخزن ملخصاً محدوداً مرتبطاً بالمستخدم الحالي فقط", () => {
    saveOfflineDashboardSnapshot(11, [
      { label: "فريق العمل", value: "8", hint: "ملفات نشطة" },
      { label: "الحضور", value: "92%", hint: "اليوم" },
      { label: "لا ينبغي حفظ هذا الصف", value: "—", hint: "حد" },
      { label: "ولا هذا أيضاً", value: "—", hint: "حد" },
      { label: "صف خامس", value: "—", hint: "لا يظهر" },
    ]);

    const snapshot = readOfflineDashboardSnapshot(11);
    expect(snapshot).toMatchObject({ version: 1, userId: 11 });
    expect(snapshot?.stats).toHaveLength(4);
    expect(readOfflineDashboardSnapshot(12)).toBeNull();
    expect(localStorage.getItem(OFFLINE_DASHBOARD_LATEST_KEY)).toContain('"userId":11');
  });

  it("يمسح كل اللقطات عند تسجيل الخروج لمنع ظهور ملخص حساب سابق", () => {
    saveOfflineDashboardSnapshot(11, [{ label: "الحضور", value: "مكتمل", hint: "اليوم" }]);
    clearOfflineDashboardSnapshots();

    expect(localStorage.getItem(`${OFFLINE_DASHBOARD_PREFIX}11`)).toBeNull();
    expect(localStorage.getItem(OFFLINE_DASHBOARD_LATEST_KEY)).toBeNull();
  });
});
