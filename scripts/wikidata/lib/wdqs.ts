import { fetchWithRetry } from "./http";
import { CONFIG, requireUserAgent } from "./config";
import { parseWdqsResponse, type WdqsResponse } from "./types";

let nextWdqsAllowedAt = 0;
let adaptiveSlowUntil = 0;

function registerRetry(status: number | null, waitMs: number) {
  const now = Date.now();

  if (status === 429) {
    adaptiveSlowUntil = Math.max(adaptiveSlowUntil, now + waitMs);
    return;
  }

  const penaltyMs = Math.min(10_000, Math.max(750, Math.round(waitMs * 0.75)));
  adaptiveSlowUntil = Math.max(adaptiveSlowUntil, now + penaltyMs);
}

async function waitForWdqsWindow() {
  const now = Date.now();
  const waitUntil = Math.max(nextWdqsAllowedAt, adaptiveSlowUntil);
  const waitMs = waitUntil - now;
  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  nextWdqsAllowedAt = Date.now() + CONFIG.wdqsMinIntervalMs;
}

export async function wdqs(query: string): Promise<WdqsResponse> {
  requireUserAgent();
  await waitForWdqsWindow();

  const url = CONFIG.wdqsEndpoint;

  const res = await fetchWithRetry(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/sparql-query; charset=utf-8",
        Accept: "application/sparql-results+json",
        "User-Agent": CONFIG.userAgent,
      },
      body: query,
    },
    {
      timeoutMs: 60_000,
      retries: CONFIG.maxRetries,
      onRetry: (info) => registerRetry(info.status, info.waitMs),
    },
  );

  if (adaptiveSlowUntil > Date.now()) {
    adaptiveSlowUntil = Math.max(Date.now(), adaptiveSlowUntil - 250);
  }

  const payload = (await res.json()) as unknown;
  return parseWdqsResponse(payload);
}
