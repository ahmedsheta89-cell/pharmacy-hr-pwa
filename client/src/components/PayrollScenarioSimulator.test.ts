import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("مختبر الرواتب الواقعي", () => {
  it("يعرض مصدر البيانات الفعلي ويحتفظ بحاجز القراءة فقط", () => {
    const component = readFileSync(join(process.cwd(), "client/src/components/PayrollScenarioSimulator.tsx"), "utf8");
    expect(component).toContain("simulationCatalog.useQuery");
    expect(component).toContain("قراءة ومحاكاة فقط");
    expect(component).toContain("استعادة قيم الهيكل");
    expect(component).toContain("لا ينشئ مسيراً ولا خصماً ولا مكافأة");
    expect(component).toContain("إعادة المحاولة");
    expect(component).toContain("جارٍ اختيار الموظف ذي الهيكل الساري");
  });
});
