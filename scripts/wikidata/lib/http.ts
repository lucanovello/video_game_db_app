function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function toHeaders(init?: HeadersInit): Headers {
  if (!init) return new Headers();
  return init instanceof Headers ? new Headers(init) : new Headers(init);
}

function parseRetryAfterMs(
  value: string | null,
  now = Date.now(),
): number | null {
  if (!value) return null;
  const s = value.trim();
  if (!s) return null;

  // Retry-After can be either a delay in seconds or an HTTP date.
  const asSeconds = Number(s);
  if (Number.isFinite(asSeconds)) {
    return Math.max(0, Math.round(asSeconds * 1000));
  }

  const asDate = Date.parse(s);
  if (!Number.isNaN(asDate)) {
    return Math.max(0, asDate - now);
  }

  return null;
}

function withPoliteDefaults(init: RequestInit): RequestInit {
  const headers = toHeaders(init.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json, */*");
  if (!headers.has("Accept-Language")) headers.set("Accept-Language", "en");
  return { ...init, headers };
}

function jitter(ms: number) {
  // keep jitter modest so we still respect Retry-After fairly closely
  const factor = 0.85 + Math.random() * 0.3; // 0.85..1.15
  return Math.max(0, Math.round(ms * factor));
}

interface FetchRetryInfo {
  attempt: number;
  waitMs: number;
  status: number | null;
  retryAfterMs: number | null;
  reason: "http" | "network";
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: {
    retries?: number;
    backoffMs?: number;
    timeoutMs?: number;
    onRetry?: (info: FetchRetryInfo) => void;
  } = {},
) {
  const retries = opts.retries ?? 6;
  let backoff = opts.backoffMs ?? 400;
  const timeoutMs = opts.timeoutMs;

  let lastErr: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    let controller: AbortController | null = null;
    let timeoutHandle: NodeJS.Timeout | null = null;

    const outerSignal = init.signal;
    if (typeof timeoutMs === "number" && timeoutMs > 0) {
      controller = new AbortController();
      if (outerSignal) {
        if (outerSignal.aborted) controller.abort();
        else
          outerSignal.addEventListener("abort", () => controller?.abort(), {
            once: true,
          });
      }
      const ctrl = controller;
      timeoutHandle = setTimeout(() => ctrl.abort(), timeoutMs);
    }

    try {
      const res = await fetch(
        url,
        withPoliteDefaults({
          ...init,
          signal: controller ? controller.signal : init.signal,
        }),
      );

      if (timeoutHandle) clearTimeout(timeoutHandle);

      if (res.ok) return res;

      if ([429, 500, 502, 503, 504].includes(res.status) && attempt < retries) {
        const retryAfterMs = parseRetryAfterMs(res.headers.get("retry-after"));
        const waitMs = retryAfterMs !== null ? retryAfterMs : jitter(backoff);
        opts.onRetry?.({
          attempt,
          waitMs,
          status: res.status,
          retryAfterMs,
          reason: "http",
        });
        await sleep(waitMs);
        backoff = Math.min(backoff * 2, 15000);
        continue;
      }

      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${url}\n${text.slice(0, 500)}`);
    } catch (err) {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      lastErr = err;

      if (attempt < retries) {
        const waitMs = jitter(backoff);
        opts.onRetry?.({
          attempt,
          waitMs,
          status: null,
          retryAfterMs: null,
          reason: "network",
        });
        await sleep(waitMs);
        backoff = Math.min(backoff * 2, 15000);
        continue;
      }

      throw err;
    }
  }

  throw new Error(`Unreachable (lastErr=${String(lastErr)})`);
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
