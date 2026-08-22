import { describe, expect, it } from "vitest";
import { fetchWithTimeout, RequestTimeoutError } from "./fetchWithTimeout";

describe("fetchWithTimeout", () => {
  it("يوقف الطلب المتعثر ويعرض خطأ مهلة قابل للفهم", async () => {
    const stalledFetcher = (_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });

    await expect(fetchWithTimeout(stalledFetcher, "/api/trpc", {}, 5)).rejects.toBeInstanceOf(RequestTimeoutError);
  });
});
