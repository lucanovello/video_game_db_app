import pLimit from "p-limit";
import type { Prisma } from "@prisma/client";
import { prisma } from "../wikidata/lib/prisma";

type QueryValue = string | number | boolean | null | undefined;

export interface WikiClientOptions {
  userAgent?: string;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  timeoutMs?: number;
  concurrency?: number;
}

export interface WikiClientStats {
  networkCalls: number;
  pageCacheHits: number;
  entityCacheHits: number;
  pageFetched: number;
  entityFetched: number;
}

export interface CachedWikiPageResult {
  site: string;
  title: string;
  revid: bigint | null;
  payloadJson: unknown;
  payloadText: string | null;
  source: "cache-hit" | "fetched";
}

export interface CachedWikidataEntityResult {
  qid: string;
  lastrevid: bigint | null;
  entityJson: unknown;
  source: "cache-hit" | "fetched";
}

interface WikipediaRevisionMetaResponse {
  query?: {
    pages?: Array<{
      missing?: boolean;
      title?: string;
      revisions?: Array<{ revid?: number }>;
    }>;
  };
}

interface WikipediaRevisionContentResponse {
  query?: {
    pages?: Array<{
      missing?: boolean;
      title?: string;
      revisions?: Array<{
        revid?: number;
        slots?: {
          main?: {
            content?: string;
          };
        };
      }>;
    }>;
  };
}

interface WbGetEntitiesInfoResponse {
  entities?: Record<
    string,
    { id?: string; missing?: string; lastrevid?: number }
  >;
}

interface WbGetEntitiesFullResponse {
  entities?: Record<string, unknown>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultUserAgent(): string {
  return (
    process.env.WIKIDATA_USER_AGENT ||
    process.env.USER_AGENT ||
    "video-game-db-app/0.1 (local-ingestion-script)"
  );
}

export class WikiClient {
  private readonly userAgent: string;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly timeoutMs: number;
  private readonly queue: ReturnType<typeof pLimit>;

  readonly stats: WikiClientStats = {
    networkCalls: 0,
    pageCacheHits: 0,
    entityCacheHits: 0,
    pageFetched: 0,
    entityFetched: 0,
  };

  constructor(options: WikiClientOptions = {}) {
    this.userAgent = options.userAgent ?? defaultUserAgent();
    this.maxRetries = options.maxRetries ?? 4;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 300;
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.queue = pLimit(options.concurrency ?? 4);
  }

  buildUrl(baseUrl: string, query: Record<string, QueryValue>): string {
    const url = new URL(baseUrl);
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  apiBaseForSite(site: string): string {
    return this.resolveWikiApiBase(site);
  }

  requestJson<T>(url: string): Promise<T> {
    return this.fetchJson<T>(url);
  }

  async getOrFetchWikiPage(
    site: string,
    title: string,
  ): Promise<CachedWikiPageResult> {
    const apiBase = this.resolveWikiApiBase(site);
    const metaUrl = this.buildUrl(apiBase, {
      action: "query",
      format: "json",
      formatversion: 2,
      redirects: 1,
      prop: "revisions",
      rvprop: "ids",
      rvslots: "main",
      titles: title,
    });

    const metaPayload =
      await this.fetchJson<WikipediaRevisionMetaResponse>(metaUrl);
    const page = metaPayload.query?.pages?.[0];
    const latestRevid = page?.revisions?.[0]?.revid;
    const normalizedTitle = page?.title?.trim() || title;

    if (page?.missing || !latestRevid) {
      throw new Error(
        `Wiki page not found or has no revisions: ${site}:${title}`,
      );
    }

    const cached = await prisma.wikiPageCache.findUnique({
      where: {
        site_title: {
          site,
          title: normalizedTitle,
        },
      },
      select: {
        revid: true,
        payloadJson: true,
        payloadText: true,
      },
    });

    const latestRevidBigInt = BigInt(latestRevid);
    if (cached?.revid === latestRevidBigInt) {
      this.stats.pageCacheHits += 1;
      console.log(
        `getOrFetchWikiPage: cache hit site=${site} title=${normalizedTitle} revid=${latestRevid}`,
      );
      return {
        site,
        title: normalizedTitle,
        revid: cached.revid,
        payloadJson: cached.payloadJson,
        payloadText: cached.payloadText,
        source: "cache-hit",
      };
    }

    const contentUrl = this.buildUrl(apiBase, {
      action: "query",
      format: "json",
      formatversion: 2,
      redirects: 1,
      prop: "revisions",
      rvprop: "ids|timestamp|content",
      rvslots: "main",
      titles: normalizedTitle,
    });

    const contentPayload =
      await this.fetchJson<WikipediaRevisionContentResponse>(contentUrl);
    const contentPayloadJson = contentPayload as Prisma.InputJsonValue;
    const contentPage = contentPayload.query?.pages?.[0];
    const revision = contentPage?.revisions?.[0];
    const contentRevid = revision?.revid;

    if (!contentRevid) {
      throw new Error(
        `Wiki page content fetch returned no revision id: ${site}:${normalizedTitle}`,
      );
    }

    const wikitext = revision?.slots?.main?.content ?? null;

    await prisma.wikiPageCache.upsert({
      where: {
        site_title: {
          site,
          title: normalizedTitle,
        },
      },
      update: {
        revid: BigInt(contentRevid),
        fetchedAt: new Date(),
        contentType: "application/json",
        payloadJson: contentPayloadJson,
        payloadText: wikitext,
      },
      create: {
        site,
        title: normalizedTitle,
        revid: BigInt(contentRevid),
        contentType: "application/json",
        payloadJson: contentPayloadJson,
        payloadText: wikitext,
      },
    });

    this.stats.pageFetched += 1;
    console.log(
      `getOrFetchWikiPage: fetched site=${site} title=${normalizedTitle} revid=${contentRevid}`,
    );

    return {
      site,
      title: normalizedTitle,
      revid: BigInt(contentRevid),
      payloadJson: contentPayload,
      payloadText: wikitext,
      source: "fetched",
    };
  }

  async getOrFetchWikidataEntity(
    qid: string,
  ): Promise<CachedWikidataEntityResult> {
    const normalizedQid = qid.toUpperCase();
    if (!/^Q\d+$/.test(normalizedQid)) {
      throw new Error(`Invalid QID: ${qid}`);
    }

    const infoUrl = this.buildUrl("https://www.wikidata.org/w/api.php", {
      action: "wbgetentities",
      format: "json",
      ids: normalizedQid,
      props: "info",
      languages: "en",
      languagefallback: 1,
    });

    const infoPayload =
      await this.fetchJson<WbGetEntitiesInfoResponse>(infoUrl);
    const info = infoPayload.entities?.[normalizedQid];

    if (!info || info.missing === "") {
      throw new Error(`Wikidata entity not found: ${normalizedQid}`);
    }

    const lastrevid = info.lastrevid;
    if (!lastrevid) {
      throw new Error(`Wikidata entity has no lastrevid: ${normalizedQid}`);
    }

    const cached = await prisma.wikidataEntityCache.findUnique({
      where: { qid: normalizedQid },
      select: { lastrevid: true, entityJson: true },
    });

    const lastrevidBigInt = BigInt(lastrevid);
    if (cached?.lastrevid === lastrevidBigInt) {
      this.stats.entityCacheHits += 1;
      console.log(
        `getOrFetchWikidataEntity: cache hit qid=${normalizedQid} lastrevid=${lastrevid}`,
      );
      return {
        qid: normalizedQid,
        lastrevid: cached.lastrevid,
        entityJson: cached.entityJson,
        source: "cache-hit",
      };
    }

    const entityUrl = this.buildUrl("https://www.wikidata.org/w/api.php", {
      action: "wbgetentities",
      format: "json",
      ids: normalizedQid,
      languages: "en",
      languagefallback: 1,
      props: "labels|descriptions|aliases|claims|sitelinks",
    });

    const entityPayload =
      await this.fetchJson<WbGetEntitiesFullResponse>(entityUrl);
    const entityJson = entityPayload.entities?.[normalizedQid];

    if (!entityJson) {
      throw new Error(
        `Wikidata entity payload missing entity ${normalizedQid}`,
      );
    }

    await prisma.wikidataEntityCache.upsert({
      where: { qid: normalizedQid },
      update: {
        lastrevid: lastrevidBigInt,
        entityJson,
        fetchedAt: new Date(),
      },
      create: {
        qid: normalizedQid,
        lastrevid: lastrevidBigInt,
        entityJson,
      },
    });

    this.stats.entityFetched += 1;
    console.log(
      `getOrFetchWikidataEntity: fetched qid=${normalizedQid} lastrevid=${lastrevid}`,
    );

    return {
      qid: normalizedQid,
      lastrevid: lastrevidBigInt,
      entityJson,
      source: "fetched",
    };
  }

  private async fetchJson<T>(url: string): Promise<T> {
    return this.queue(async () => {
      let attempt = 0;
      let backoffMs = this.retryBaseDelayMs;

      while (true) {
        attempt += 1;

        const controller = new AbortController();
        const timeoutHandle = setTimeout(
          () => controller.abort(),
          this.timeoutMs,
        );

        try {
          this.stats.networkCalls += 1;
          const response = await fetch(url, {
            method: "GET",
            signal: controller.signal,
            headers: {
              Accept: "application/json",
              "Accept-Language": "en",
              "User-Agent": this.userAgent,
            },
          });

          if (response.ok) {
            const payload = (await response.json()) as T;
            clearTimeout(timeoutHandle);
            return payload;
          }

          const retryable = [429, 500, 502, 503, 504].includes(response.status);
          if (retryable && attempt <= this.maxRetries) {
            clearTimeout(timeoutHandle);
            await sleep(backoffMs);
            backoffMs = Math.min(backoffMs * 2, 10000);
            continue;
          }

          const body = await response.text().catch(() => "");
          clearTimeout(timeoutHandle);
          throw new Error(
            `HTTP ${response.status} ${url}\n${body.slice(0, 500)}`,
          );
        } catch (error) {
          clearTimeout(timeoutHandle);
          if (attempt <= this.maxRetries) {
            await sleep(backoffMs);
            backoffMs = Math.min(backoffMs * 2, 10000);
            continue;
          }

          throw error;
        }
      }
    });
  }

  private resolveWikiApiBase(site: string): string {
    const normalized = site.trim().toLowerCase();

    if (normalized === "wikidata" || normalized === "wikidata:en") {
      return "https://www.wikidata.org/w/api.php";
    }

    if (normalized.startsWith("wikipedia:")) {
      const lang = normalized.split(":")[1];
      if (!lang) {
        throw new Error(`Invalid site language: ${site}`);
      }
      return `https://${lang}.wikipedia.org/w/api.php`;
    }

    if (normalized.includes(".")) {
      return `https://${normalized}/w/api.php`;
    }

    throw new Error(`Unsupported site format: ${site}`);
  }
}
