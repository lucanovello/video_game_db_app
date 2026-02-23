import { prisma } from "./lib/prisma";

const SITE = "wikipedia:en";
const TITLE = "List of video games considered the best";
const QID = "Q42";

async function main() {
  const startedAt = Date.now();

  const page = await prisma.wikiPageCache.upsert({
    where: {
      site_title: {
        site: SITE,
        title: TITLE,
      },
    },
    update: {
      revid: BigInt(123456),
      contentType: "application/json",
      payloadJson: {
        source: "smoke-test",
        page: TITLE,
        checkedAt: new Date().toISOString(),
      },
      payloadText: "smoke content",
      headersJson: {
        etag: 'W/"smoke"',
      },
      fetchedAt: new Date(),
    },
    create: {
      site: SITE,
      title: TITLE,
      revid: BigInt(123456),
      contentType: "application/json",
      payloadJson: {
        source: "smoke-test",
        page: TITLE,
        checkedAt: new Date().toISOString(),
      },
      payloadText: "smoke content",
      headersJson: {
        etag: 'W/"smoke"',
      },
    },
  });

  const entity = await prisma.wikidataEntityCache.upsert({
    where: { qid: QID },
    update: {
      lastrevid: BigInt(987654),
      entityJson: {
        id: QID,
        labels: {
          en: { language: "en", value: "Douglas Adams" },
        },
      },
      fetchedAt: new Date(),
    },
    create: {
      qid: QID,
      lastrevid: BigInt(987654),
      entityJson: {
        id: QID,
        labels: {
          en: { language: "en", value: "Douglas Adams" },
        },
      },
    },
  });

  await prisma.extractedQid.upsert({
    where: {
      pageCacheId_qid: {
        pageCacheId: page.id,
        qid: QID,
      },
    },
    update: {
      extractor: "smoke-cache-writes",
    },
    create: {
      pageCacheId: page.id,
      qid: QID,
      extractor: "smoke-cache-writes",
    },
  });

  const [pageReadBack, entityReadBack, extractedCount] = await Promise.all([
    prisma.wikiPageCache.findUnique({
      where: {
        site_title: {
          site: SITE,
          title: TITLE,
        },
      },
      select: {
        id: true,
        site: true,
        title: true,
        revid: true,
      },
    }),
    prisma.wikidataEntityCache.findUnique({
      where: { qid: QID },
      select: {
        qid: true,
        lastrevid: true,
      },
    }),
    prisma.extractedQid.count({
      where: {
        pageCacheId: page.id,
      },
    }),
  ]);

  if (!pageReadBack || !entityReadBack) {
    throw new Error(
      "Smoke check failed: cache rows were not readable after write",
    );
  }

  const elapsedMs = Date.now() - startedAt;
  console.log(
    `smokeCacheWrites: pageUpserted=${page.id} entityUpserted=${entity.qid} extractedForPage=${extractedCount} elapsedMs=${elapsedMs}`,
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
