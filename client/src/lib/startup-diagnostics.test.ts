import { describe, expect, it } from "vitest";
import { createStartupDiagnostic } from "./startup-diagnostics";

describe("بصمة فشل بدء التطبيق", () => {
  it("تصنف تعذر تحميل وحدة ديناميكية من دون تضمين stack trace", () => {
    const diagnostic = createStartupDiagnostic(new TypeError("Failed to fetch dynamically imported module: https://example.test/assets/app.js"));
    expect(diagnostic.code).toBe("BOOTSTRAP_MODULE_LOAD");
    expect(diagnostic.name).toBe("TypeError");
    expect(diagnostic.message).not.toContain("\n");
  });

  it("تقيد رسالة التشخيص وتطهر محارف التحكم", () => {
    const diagnostic = createStartupDiagnostic(new Error(`performance.now is not a function\n${"x".repeat(300)}`));
    expect(diagnostic.code).toBe("PERFORMANCE_API");
    expect(diagnostic.message).not.toContain("\n");
    expect(diagnostic.message.length).toBeLessThanOrEqual(160);
  });
});
