import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const readProjectFile = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), "utf8");

describe("نقطة بدء التطبيق القابلة للاسترداد", () => {
  it("تبقي نقطة الدخول خفيفة وتلتقط فشل تحميل وحدات التطبيق قبل إزالة شاشة البدء", () => {
    const main = readProjectFile("client/src/main.tsx");
    expect(main).toContain('import("./bootstrap")');
    expect(main).toContain("renderStartupFallback");
    expect(main).not.toContain('import App from "./App"');
    const bootstrap = readProjectFile("client/src/bootstrap.tsx");
    expect(bootstrap).toContain('document.getElementById("startup-shell")?.remove()');
  });
});
