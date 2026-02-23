import { prisma } from "../wikidata/lib/prisma";
import { WikiClient } from "./wikiClient";

const SITE = process.env.WIKI_SMOKE_SITE ?? "wikipedia:en";
const TITLE =
  process.env.WIKI_SMOKE_TITLE ?? "List of best-selling video game franchises";
const QID = process.env.WIKI_SMOKE_QID ?? "Q7889";

async function main() {
  const startedAt = Date.now();

  const client = new WikiClient({
    concurrency: 2,
    maxRetries: 4,
    timeoutMs: 30000,
  });

  const page = await client.getOrFetchWikiPage(SITE, TITLE);
  const entity = await client.getOrFetchWikidataEntity(QID);

  const [cachedPage, cachedEntity] = await Promise.all([
    prisma.wikiPageCache.findUnique({
      where: {
        site_title: {
          site: page.site,
          title: page.title,
        },
      },
      select: { id: true, revid: true, updatedAt: true },
    }),
    prisma.wikidataEntityCache.findUnique({
      where: { qid: entity.qid },
      select: { qid: true, lastrevid: true, updatedAt: true },
    }),
  ]);

  if (!cachedPage || !cachedEntity) {
    throw new Error(
      "Smoke check failed: cache rows not found after getOrFetch calls",
    );
  }

  const elapsedMs = Date.now() - startedAt;
  console.log(
    `smokeWikiClient: page=${page.source} entity=${entity.source} networkCalls=${client.stats.networkCalls} pageFetched=${client.stats.pageFetched} pageCacheHits=${client.stats.pageCacheHits} entityFetched=${client.stats.entityFetched} entityCacheHits=${client.stats.entityCacheHits} elapsedMs=${elapsedMs}`,
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
