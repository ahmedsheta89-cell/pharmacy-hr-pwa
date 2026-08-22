import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("تخطيط الرواتب المحمول", () => {
  it("يحتوي حاوية الرواتب ضمن عرض الشاشة ولا يفرض عرضاً أدنى", () => {
    const source = readFileSync(join(process.cwd(), "client/src/pages/ModulePage.tsx"), "utf8");
    const payrollSection = source.slice(source.indexOf("function PayrollModule"), source.indexOf("export default function ModulePage"));
    expect(payrollSection).toContain('className="min-w-0 max-w-full space-y-6 overflow-x-clip"');
    expect(payrollSection).not.toMatch(/min-w-\[[^\]]+\]|w-\[[^\]]+\]/);
    expect(payrollSection).toContain('className="grid gap-3 md:grid-cols-4"');
    expect(payrollSection).toContain('className="grid gap-3 sm:grid-cols-4"');
  });
});
