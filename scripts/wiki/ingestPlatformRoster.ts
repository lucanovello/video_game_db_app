import { prisma } from "../wikidata/lib/prisma";
import { WikiClient } from "./wikiClient";

const SOURCE_TYPE = "WIKIPEDIA_LIST";
const WIKIPEDIA_SITE = "wikipedia:en";
const TITLE_BATCH_SIZE = 50;
const INSERT_BATCH_SIZE = 1000;

interface WikiPagePropsResponse {
  query?: {
    pages?: Array<{
      missing?: boolean;
      title?: string;
      pageprops?: {
        wikibase_item?: string;
      };
    }>;
  };
}

interface PlatformSourceRow {
  id: string;
  platformQid: string;
  sourceType: string;
  pageTitle: string;
  pageUrl: string | null;
  notes: string | null;
  isActive: boolean;
  platform: {
    platformQid: string;
    nameLabel: string;
    status: string;
  };
}

function parsePlatformFilterArg(): string | null {
  const fromEnv = process.env.PLATFORM_QID?.trim().toUpperCase();
  if (fromEnv) return fromEnv;

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--platform=")) {
      return arg.slice("--platform=".length).trim().toUpperCase();
    }
    if (arg.startsWith("--platform-qid=")) {
      return arg.slice("--platform-qid=".length).trim().toUpperCase();
    }
  }

  return null;
}

function chunk<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size));
  }
  return out;
}

function normalizeLinkedTitle(raw: string): string | null {
  const value = raw.trim().replaceAll("_", " ");
  if (!value) return null;

  if (value.includes(":")) {
    const namespace = value.split(":", 1)[0]?.toLowerCase() ?? "";
    const blocked = new Set([
      "file",
      "image",
      "category",
      "template",
      "help",
      "portal",
      "wikipedia",
      "draft",
      "module",
      "mediawiki",
      "special",
      "user",
      "talk",
    ]);
    if (blocked.has(namespace)) return null;
  }

  if (/^(list|lists|index|timeline) of\b/i.test(value)) return null;
  if (/^\d{3,4}$/.test(value)) return null;

  return value;
}

function extractLinkedTitlesFromWikitext(wikitext: string): string[] {
  const linkRegex = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
  const titles = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(wikitext)) !== null) {
    const rawTarget = match[1];
    if (!rawTarget) continue;

    const normalized = normalizeLinkedTitle(rawTarget);
    if (!normalized) continue;

    titles.add(normalized);
  }

  return [...titles].sort((a, b) => a.localeCompare(b));
}

async function resolveWikipediaTitlesToQids(
  client: WikiClient,
  titles: string[],
): Promise<Set<string>> {
  const qids = new Set<string>();
  if (!titles.length) return qids;

  const apiBase = client.apiBaseForSite(WIKIPEDIA_SITE);

  for (const titleBatch of chunk(titles, TITLE_BATCH_SIZE)) {
    const url = client.buildUrl(apiBase, {
      action: "query",
      format: "json",
      formatversion: 2,
      redirects: 1,
      prop: "pageprops",
      ppprop: "wikibase_item",
      titles: titleBatch.join("|"),
    });

    const payload = await client.requestJson<WikiPagePropsResponse>(url);
    const pages = payload.query?.pages ?? [];

    for (const page of pages) {
      if (page.missing) continue;
      const qid = page.pageprops?.wikibase_item?.toUpperCase();
      if (!qid || !/^Q\d+$/.test(qid)) continue;
      qids.add(qid);
    }
  }

  return qids;
}

async function ingestSource(
  client: WikiClient,
  source: PlatformSourceRow,
): Promise<{
  inserted: number;
  linkedTitles: number;
  resolvedQids: number;
}> {
  const page = await client.getOrFetchWikiPage(WIKIPEDIA_SITE, source.pageTitle);

  const sourcePage = await prisma.wikiPageCache.findUnique({
    where: {
      site_title: {
        site: WIKIPEDIA_SITE,
        title: page.title,
      },
    },
    select: { id: true },
  });

  if (!sourcePage) {
    throw new Error(
      `Cached source page not found for ${WIKIPEDIA_SITE}:${source.pageTitle}`,
    );
  }

  const wikitext = page.payloadText ?? "";
  if (!wikitext) {
    console.log(
      `ingestPlatformRoster: skipped empty wikitext platform=${source.platformQid} title=${source.pageTitle}`,
    );
    return { inserted: 0, linkedTitles: 0, resolvedQids: 0 };
  }

  const linkedTitles = extractLinkedTitlesFromWikitext(wikitext);
  const qids = await resolveWikipediaTitlesToQids(client, linkedTitles);

  let inserted = 0;
  const qidList = [...qids].sort((a, b) => a.localeCompare(b));
  for (const batch of chunk(qidList, INSERT_BATCH_SIZE)) {
    const result = await prisma.platformGameMembership.createMany({
      data: batch.map((gameQid) => ({
        platformQid: source.platformQid,
        gameQid,
        sourcePageId: sourcePage.id,
      })),
      skipDuplicates: true,
    });
    inserted += result.count;
  }

  console.log(
    `ingestPlatformRoster: platform=${source.platformQid} name=${source.platform.nameLabel} pageTitle=${source.pageTitle} linkedTitles=${linkedTitles.length} resolvedQids=${qids.size} inserted=${inserted}`,
  );

  return {
    inserted,
    linkedTitles: linkedTitles.length,
    resolvedQids: qids.size,
  };
}

async function main() {
  const startedAt = Date.now();
  const platformFilter = parsePlatformFilterArg();

  if (platformFilter && !/^Q\d+$/.test(platformFilter)) {
    throw new Error(`Invalid platform filter QID: ${platformFilter}`);
  }

  const sources = await prisma.platformRosterSource.findMany({
    where: {
      sourceType: SOURCE_TYPE,
      isActive: true,
      ...(platformFilter ? { platformQid: platformFilter } : {}),
      platform: {
        status: "ACTIVE",
      },
    },
    select: {
      id: true,
      platformQid: true,
      sourceType: true,
      pageTitle: true,
      pageUrl: true,
      notes: true,
      isActive: true,
      platform: {
        select: {
          platformQid: true,
          nameLabel: true,
          status: true,
        },
      },
    },
    orderBy: [{ platformQid: "asc" }, { pageTitle: "asc" }],
  });

  if (!sources.length) {
    throw new Error(
      platformFilter
        ? `No active roster sources found for platform ${platformFilter}.`
        : "No active roster sources found. Run bootstrapPlatforms first.",
    );
  }

  const client = new WikiClient({ concurrency: 3, maxRetries: 5, timeoutMs: 30000 });

  let totalInserted = 0;
  let totalLinkedTitles = 0;
  let totalResolvedQids = 0;

  for (const source of sources) {
    const outcome = await ingestSource(client, source);
    totalInserted += outcome.inserted;
    totalLinkedTitles += outcome.linkedTitles;
    totalResolvedQids += outcome.resolvedQids;
  }

  const membershipWhere = platformFilter
    ? { platformQid: platformFilter }
    : undefined;

  const totalMembershipRows = await prisma.platformGameMembership.count({
    where: membershipWhere,
  });

  const elapsedMs = Date.now() - startedAt;
  console.log(
    `ingestPlatformRoster: sources=${sources.length} linkedTitles=${totalLinkedTitles} resolvedQids=${totalResolvedQids} inserted=${totalInserted} totalMembershipRows=${totalMembershipRows} networkCalls=${client.stats.networkCalls} pageFetched=${client.stats.pageFetched} pageCacheHits=${client.stats.pageCacheHits} elapsedMs=${elapsedMs}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
