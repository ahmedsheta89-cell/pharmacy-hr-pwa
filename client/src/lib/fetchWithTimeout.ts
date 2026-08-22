export class RequestTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`انتهت مهلة الاتصال بعد ${Math.ceil(timeoutMs / 1000)} ثانية. تحقق من الشبكة ثم أعد المحاولة.`);
    this.name = "RequestTimeoutError";
  }
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function fetchWithTimeout(
  fetcher: Fetcher,
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 15_000,
) {
  const controller = new AbortController();
  const sourceSignal = init.signal;
  const forwardAbort = () => controller.abort(sourceSignal?.reason);
  let timedOut = false;

  if (sourceSignal?.aborted) forwardAbort();
  else sourceSignal?.addEventListener("abort", forwardAbort, { once: true });

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetcher(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new RequestTimeoutError(timeoutMs);
    throw error;
  } finally {
    clearTimeout(timeout);
    sourceSignal?.removeEventListener("abort", forwardAbort);
  }
}
