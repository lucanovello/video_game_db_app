import { prisma } from "../wikidata/lib/prisma";

const SITE = "wikidata";
const TITLE_PREFIX =
  process.env.WIKI_PROJECT_PARSE_PREFIX ||
  process.env.WIKI_PROJECT_LIST_PREFIX_FALLBACK ||
  "Wikidata:WikiProject Video games/";
const EXTRACTOR = "wiki-project-lists-regex";
const QID_REGEX = /\bQ\d+\b/g;
const BATCH_SIZE = 1000;

function extractQids(text: string): string[] {
  const matches = text.match(QID_REGEX) ?? [];
  if (!matches.length) return [];

  const unique = new Set<string>();
  for (const match of matches) {
    unique.add(match);
  }

  return [...unique];
}

async function main() {
  const startedAt = Date.now();

  const pages = await prisma.wikiPageCache.findMany({
    where: {
      site: SITE,
      title: { startsWith: TITLE_PREFIX },
    },
    select: {
      id: true,
      title: true,
      payloadText: true,
      payloadJson: true,
    },
    orderBy: [{ title: "asc" }],
  });

  if (!pages.length) {
    throw new Error(
      "No cached WikiProject list pages found. Run fetchWikiProjectVideoGamesLists first.",
    );
  }

  let pagesParsed = 0;
  let pagesWithQids = 0;
  let extractedPairs = 0;
  let insertedRows = 0;

  for (const page of pages) {
    const sourceText =
      page.payloadText ??
      (page.payloadJson ? JSON.stringify(page.payloadJson) : "");

    if (!sourceText) {
      pagesParsed += 1;
      continue;
    }

    const qids = extractQids(sourceText);
    pagesParsed += 1;

    if (!qids.length) {
      continue;
    }

    pagesWithQids += 1;
    extractedPairs += qids.length;

    for (let i = 0; i < qids.length; i += BATCH_SIZE) {
      const chunk = qids.slice(i, i + BATCH_SIZE);
      const result = await prisma.extractedQid.createMany({
        data: chunk.map((qid) => ({
          pageCacheId: page.id,
          qid,
          extractor: EXTRACTOR,
        })),
        skipDuplicates: true,
      });
      insertedRows += result.count;
    }
  }

  const totalStored = await prisma.extractedQid.count({
    where: {
      pageCache: {
        site: SITE,
        title: { startsWith: TITLE_PREFIX },
      },
    },
  });

  const uniqueAcrossProject = await prisma.extractedQid.findMany({
    where: {
      pageCache: {
        site: SITE,
        title: { startsWith: TITLE_PREFIX },
      },
    },
    select: { qid: true },
  });

  const uniqueQids = new Set(uniqueAcrossProject.map((row) => row.qid));
  const elapsedMs = Date.now() - startedAt;

  console.log(
    `parseWikiProjectQids: pagesParsed=${pagesParsed} pagesWithQids=${pagesWithQids} extractedPairs=${extractedPairs} insertedRows=${insertedRows} totalStored=${totalStored} uniqueQids=${uniqueQids.size} elapsedMs=${elapsedMs}`,
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
