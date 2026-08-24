import { beforeEach, describe, expect, it } from "vitest";
import { getPerformanceSnapshot, recordApiRequest, resetPerformanceSnapshot } from "./performanceMonitor";

describe("performanceMonitor", () => {
  beforeEach(() => resetPerformanceSnapshot());

  it("aggregates request duration and failures without sending operational data", () => {
    recordApiRequest(120, true);
    recordApiRequest(280, false);

    expect(getPerformanceSnapshot()).toMatchObject({
      apiRequests: 2,
      apiFailures: 1,
      averageApiMs: 200,
      slowestApiMs: 280,
    });
  });
});
