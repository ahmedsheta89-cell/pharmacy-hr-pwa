import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const readProjectFile = (relativePath: string) => readFileSync(join(projectRoot, relativePath), "utf8");

describe("إعدادات PWA وإتاحة الهاتف", () => {
  it("لا يمنع تكبير الصفحة ويستخدم مساحة العرض الآمنة", () => {
    const html = readProjectFile("client/index.html");
    expect(html).toContain("viewport-fit=cover");
    expect(html).not.toContain("maximum-scale=1");
  });

  it("يعرّف تطبيقاً عربياً مستقلاً قابلاً للتثبيت", () => {
    const manifest = JSON.parse(readProjectFile("client/public/manifest.webmanifest"));
    expect(manifest).toMatchObject({ lang: "ar", dir: "rtl", display: "standalone", id: "/", scope: "/" });
    expect(manifest.icons).toHaveLength(1);
  });

  it("يخزن غلاف التطبيق ويستثني واجهات البيانات الحية من التخزين ويوجه للتعافي دون اتصال", () => {
    const serviceWorker = readProjectFile("client/public/sw.js");
    expect(serviceWorker).toContain('const CACHE_NAME = "pharmacy-hr-shell-v5"');
    expect(serviceWorker.match(/const CACHE_NAME/g)).toHaveLength(1);
    expect(serviceWorker).toContain('url.pathname.startsWith("/api/")');
    expect(serviceWorker).toContain('caches.match("/offline.html")');
    expect(serviceWorker).toContain("SKIP_WAITING");
    const offlinePage = readProjectFile("client/public/offline.html");
    expect(offlinePage).toContain("لا يوجد اتصال بالإنترنت");
    expect(offlinePage).toContain("آخر بيانات أساسية متاحة");
    expect(offlinePage).toContain("pharmacy-hr:offline-dashboard:latest");
  });

  it("يحترم تفضيل تقليل الحركة عند تحريك اختصارات الهاتف", () => {
    const styles = readProjectFile("client/src/index.css");
    expect(styles).toContain("mobile-shortcut-active");
    expect(styles).toContain("prefers-reduced-motion: no-preference");
  });
});
