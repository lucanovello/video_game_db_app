import { prisma } from "../wikidata/lib/prisma";
import { WikiClient } from "./wikiClient";

const SITE = "wikidata";
const LISTS_QUERY_PREFIX =
  process.env.WIKI_PROJECT_LIST_QUERY_PREFIX ||
  "WikiProject Video games/Lists/";
const FALLBACK_QUERY_PREFIX =
  process.env.WIKI_PROJECT_LIST_QUERY_PREFIX_FALLBACK ||
  "WikiProject Video games/";
const PROJECT_NAMESPACE = 4;

interface AllPagesResponse {
  continue?: {
    apcontinue?: string;
    continue?: string;
  };
  query?: {
    allpages?: Array<{
      title?: string;
    }>;
  };
}

async function discoverPageTitlesByPrefix(
  client: WikiClient,
  queryPrefix: string,
): Promise<string[]> {
  const apiBase = client.apiBaseForSite(SITE);
  const titles = new Set<string>();
  const fullTitlePrefix = `Wikidata:${queryPrefix}`;

  let apcontinue: string | undefined;
  let pageCount = 0;

  while (true) {
    const url = client.buildUrl(apiBase, {
      action: "query",
      format: "json",
      formatversion: 2,
      list: "allpages",
      apnamespace: PROJECT_NAMESPACE,
      apprefix: queryPrefix,
      aplimit: "max",
      apcontinue,
    });

    const payload = await client.requestJson<AllPagesResponse>(url);
    const pageBatch = payload.query?.allpages ?? [];

    for (const page of pageBatch) {
      const title = page.title?.trim();
      if (!title) continue;
      if (!title.startsWith(fullTitlePrefix)) continue;
      titles.add(title);
    }

    pageCount += 1;
    if (!payload.continue?.apcontinue) break;
    apcontinue = payload.continue.apcontinue;
  }

  console.log(
    `fetchWikiProjectVideoGamesLists: discovered pages=${titles.size} listingRequests=${pageCount} prefix=${queryPrefix}`,
  );

  return [...titles].sort((a, b) => a.localeCompare(b));
}

async function main() {
  const startedAt = Date.now();
  const client = new WikiClient({
    concurrency: 4,
    maxRetries: 5,
    timeoutMs: 30000,
  });

  let titles = await discoverPageTitlesByPrefix(client, LISTS_QUERY_PREFIX);
  let activeQueryPrefix = LISTS_QUERY_PREFIX;

  if (
    !titles.length &&
    FALLBACK_QUERY_PREFIX &&
    FALLBACK_QUERY_PREFIX !== LISTS_QUERY_PREFIX
  ) {
    console.log(
      `fetchWikiProjectVideoGamesLists: no pages under prefix=${LISTS_QUERY_PREFIX}; falling back to prefix=${FALLBACK_QUERY_PREFIX}`,
    );
    titles = await discoverPageTitlesByPrefix(client, FALLBACK_QUERY_PREFIX);
    activeQueryPrefix = FALLBACK_QUERY_PREFIX;
  }

  if (!titles.length) {
    throw new Error(
      `No pages found with prefix '${LISTS_QUERY_PREFIX}' (or fallback '${FALLBACK_QUERY_PREFIX}') under ${SITE}.`,
    );
  }

  const activeTitlePrefix = `Wikidata:${activeQueryPrefix}`;

  let fetched = 0;
  let cacheHit = 0;

  for (const title of titles) {
    const result = await client.getOrFetchWikiPage(SITE, title);
    if (result.source === "fetched") fetched += 1;
    else cacheHit += 1;
  }

  const cachedRows = await prisma.wikiPageCache.count({
    where: {
      site: SITE,
      title: { startsWith: activeTitlePrefix },
    },
  });

  const elapsedMs = Date.now() - startedAt;
  console.log(
    `fetchWikiProjectVideoGamesLists: pagesTotal=${titles.length} fetched=${fetched} cacheHit=${cacheHit} cacheRows=${cachedRows} prefixUsed=${activeTitlePrefix} networkCalls=${client.stats.networkCalls} elapsedMs=${elapsedMs}`,
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
