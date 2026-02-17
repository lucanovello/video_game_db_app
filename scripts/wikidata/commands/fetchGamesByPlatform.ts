import type { Prisma } from "@prisma/client";
import { CONFIG } from "../lib/config";
import { prisma } from "../lib/prisma";
import { wdqs } from "../lib/wdqs";
import { getBindingString, type WdqsBinding } from "../lib/types";

interface CliOptions {
  platformQids: string[];
  resetCursor: boolean;
  platformLimit: number | null;
}

interface RosterRow {
  qid: string;
  title: string;
}

interface PlatformRow {
  qid: string;
  name: string;
  sitelinks: number;
  gamesCursorQid: string | null;
}

interface PlatformRunStats {
  pages: number;
  rowsSeen: number;
  gamesCreated: number;
  linksCreated: number;
}

function parseIntOrNull(raw: string | undefined): number | null {
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseCliOptions(argv: string[]): CliOptions {
  const platformArg = argv.find((value) => value.startsWith("--platform="));
  const limitArg = argv.find((value) => value.startsWith("--platform-limit="));

  return {
    platformQids: platformArg
      ? platformArg
          .slice("--platform=".length)
          .split(",")
          .map((value) => value.trim())
          .filter((value) => value.startsWith("Q"))
      : [],
    resetCursor: argv.includes("--reset-cursor"),
    platformLimit: parseIntOrNull(limitArg?.slice("--platform-limit=".length)),
  };
}

function escapeSparqlString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function buildGamesQuery(
  platformQid: string,
  cursorQid: string | null,
  pageSize: number,
): string {
  const cursorFilter = cursorQid
    ? `FILTER(?gameQid > "${escapeSparqlString(cursorQid)}")`
    : "";

  return `
SELECT DISTINCT ?game ?gameQid ?gameLabel WHERE {
  ?game wdt:P31 wd:Q7889 ;
        wdt:P400 wd:${platformQid} .
  BIND(STRAFTER(STR(?game), "http://www.wikidata.org/entity/") AS ?gameQid)
  ${cursorFilter}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY ?gameQid
LIMIT ${pageSize}
`;
}

function parseRosterRows(bindings: WdqsBinding[]): RosterRow[] {
  const rows = new Map<string, RosterRow>();

  for (const binding of bindings) {
    const qid = getBindingString(binding, "gameQid");
    if (!qid || !qid.startsWith("Q")) continue;

    const label = getBindingString(binding, "gameLabel")?.trim() || qid;
    rows.set(qid, { qid, title: label });
  }

  return [...rows.values()].sort((a, b) => a.qid.localeCompare(b.qid));
}

async function ingestPlatform(
  platform: PlatformRow,
): Promise<PlatformRunStats> {
  let cursor = platform.gamesCursorQid;
  const stats: PlatformRunStats = {
    pages: 0,
    rowsSeen: 0,
    gamesCreated: 0,
    linksCreated: 0,
  };

  for (;;) {
    const query = buildGamesQuery(platform.qid, cursor, CONFIG.wdqsPageSize);
    const response = await wdqs(query);
    const rows = parseRosterRows(response.results.bindings);
    stats.pages += 1;
    stats.rowsSeen += rows.length;

    if (!rows.length) {
      await prisma.platform.update({
        where: { qid: platform.qid },
        data: {
          gamesIngestedAt: new Date(),
          gamesCursorUpdatedAt: new Date(),
        },
      });
      break;
    }

    const gamesData: Prisma.GameCreateManyInput[] = rows.map((row) => ({
      qid: row.qid,
      title: row.title,
    }));
    const linksData: Prisma.GamePlatformCreateManyInput[] = rows.map((row) => ({
      gameQid: row.qid,
      platformQid: platform.qid,
      source: "wikidata:P400",
    }));

    const lastQid = rows[rows.length - 1]?.qid ?? cursor;
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      const createdGames = await tx.game.createMany({
        data: gamesData,
        skipDuplicates: true,
      });
      const createdLinks = await tx.gamePlatform.createMany({
        data: linksData,
        skipDuplicates: true,
      });

      stats.gamesCreated += createdGames.count;
      stats.linksCreated += createdLinks.count;

      await tx.platform.update({
        where: { qid: platform.qid },
        data: {
          gamesCursorQid: lastQid,
          gamesCursorUpdatedAt: now,
          gamesIngestedAt: rows.length < CONFIG.wdqsPageSize ? now : null,
        },
      });
    });

    cursor = lastQid;

    console.log(
      `fetchGamesByPlatform: platform=${platform.qid} page=${stats.pages} rows=${rows.length} cursor=${cursor}`,
    );

    if (rows.length < CONFIG.wdqsPageSize) break;
  }

  return stats;
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const maxPlatforms = options.platformLimit ?? CONFIG.fetchPlatformLimit;

  const where: Prisma.PlatformWhereInput = {
    isMajor: true,
  };

  if (options.platformQids.length) {
    where.qid = { in: options.platformQids };
  }

  if (options.resetCursor) {
    await prisma.platform.updateMany({
      where,
      data: {
        gamesCursorQid: null,
        gamesCursorUpdatedAt: null,
        gamesIngestedAt: null,
      },
    });
  }

  const platforms = await prisma.platform.findMany({
    where,
    orderBy: [{ sitelinks: "desc" }, { name: "asc" }],
    take: maxPlatforms ?? undefined,
    select: {
      qid: true,
      name: true,
      sitelinks: true,
      gamesCursorQid: true,
    },
  });

  if (!platforms.length) {
    throw new Error(
      "No major platforms found. Run scripts/wikidata/commands/setMajorPlatforms.ts first.",
    );
  }

  let totalRowsSeen = 0;
  let totalGamesCreated = 0;
  let totalLinksCreated = 0;
  let totalPages = 0;

  for (const platform of platforms) {
    console.log(
      `fetchGamesByPlatform: starting platform=${platform.qid} (${platform.name}) cursor=${platform.gamesCursorQid ?? "(start)"}`,
    );

    const stats = await ingestPlatform(platform);
    totalRowsSeen += stats.rowsSeen;
    totalGamesCreated += stats.gamesCreated;
    totalLinksCreated += stats.linksCreated;
    totalPages += stats.pages;
  }

  console.log(
    `fetchGamesByPlatform: platforms=${platforms.length} pages=${totalPages} rows=${totalRowsSeen} newGames=${totalGamesCreated} newLinks=${totalLinksCreated}`,
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
