import "dotenv/config";

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseOptionalIntEnv(name: string): number | null {
  const raw = process.env[name];
  if (!raw) return null;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseQidCsv(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.startsWith("Q"));
}

function parseWdqsPageSize(): number {
  const raw = process.env.WDQS_PAGE_SIZE ?? process.env.PAGE_SIZE;
  const fallback = 2000;
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;

  if (parsed < 200) {
    throw new Error(
      `Invalid WDQS page size (${parsed}). Use WDQS_PAGE_SIZE >= 200 to avoid extremely slow paging.`,
    );
  }

  return parsed;
}

function parseDelayRange(): { min: number; max: number } {
  const minRaw = process.env.WDQS_MIN_DELAY_MS ?? process.env.MIN_DELAY_MS;
  const maxRaw = process.env.WDQS_MAX_DELAY_MS ?? process.env.MAX_DELAY_MS;

  const min = parseIntEnv(
    "WDQS_MIN_DELAY_MS",
    minRaw ? parseIntEnv("MIN_DELAY_MS", 0) : 0,
  );
  const max = parseIntEnv(
    "WDQS_MAX_DELAY_MS",
    maxRaw ? parseIntEnv("MAX_DELAY_MS", 250) : 250,
  );

  return { min: Math.max(0, min), max: Math.max(Math.max(0, min), max) };
}

const wdqsDelayRange = parseDelayRange();

export const CONFIG = {
  userAgent: process.env.WIKIDATA_USER_AGENT || process.env.USER_AGENT || "",
  wdqsEndpoint:
    process.env.WDQS_ENDPOINT || "https://query.wikidata.org/sparql",
  minDelayMs: wdqsDelayRange.min,
  maxDelayMs: wdqsDelayRange.max,
  maxRetries: parseIntEnv("MAX_RETRIES", 6),
  wdqsPageSize: parseWdqsPageSize(),
  wdqsMinIntervalMs: parseIntEnv("WDQS_MIN_INTERVAL_MS", 250),
  majorPlatformsTopN: parseIntEnv("MAJOR_PLATFORM_TOP_N", 25),
  majorPlatformsMinSitelinks: parseIntEnv("MAJOR_PLATFORM_MIN_SITELINKS", 8),
  majorPlatformIncludeQids: parseQidCsv(
    process.env.MAJOR_PLATFORM_INCLUDE_QIDS,
  ),
  fetchPlatformLimit: parseOptionalIntEnv("FETCH_PLATFORM_LIMIT"),
  enrichBatchSize: parseIntEnv("ENRICH_BATCH_SIZE", 50),
  enrichConcurrency: parseIntEnv("ENRICH_CONCURRENCY", 3),
  enrichMaxGames: parseOptionalIntEnv("ENRICH_MAX_GAMES"),
};

export function requireUserAgent() {
  if (!CONFIG.userAgent.trim()) {
    throw new Error("Missing WIKIDATA_USER_AGENT (or USER_AGENT) in .env");
  }
}
