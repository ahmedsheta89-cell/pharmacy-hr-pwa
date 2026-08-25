import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("تقسيم حزم الإنتاج", () => {
  it("لا يفرض تجميع React يدوياً في دورة مع حزمة الدخول", () => {
    const config = readFileSync(join(process.cwd(), "vite.config.ts"), "utf8");
    expect(config).not.toContain("manualChunks");
    expect(config).not.toContain('"react-runtime"');
  });
});
