import "dotenv/config";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

function cell(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "bigint") return v.toString();
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(rows, headers) {
  const head = headers.join(",");
  const body = rows
    .map((r) => headers.map((h) => cell(r[h])).join(","))
    .join("\n");
  return head + "\n" + body + "\n";
}

try {
  // Summary counts
  const [
    platforms_total,
    platforms_major,
    platforms_roster_done,
    platforms_wdqs_ingested,
    wiki_roster_memberships,
    games_total,
    games_enriched,
    game_platform_links,
    release_dates,
    game_companies,
    game_tags,
    websites,
    external_games,
    images,
    videos,
    age_ratings,
    scores,
    wiki_pages_cached,
    wikidata_entities_cached,
  ] = await prisma.$transaction([
    prisma.platform.count(),
    prisma.platform.count({ where: { isMajor: true } }),
    prisma.platform.count({ where: { gamesRosterDone: true } }),
    prisma.platform.count({ where: { gamesIngestedAt: { not: null } } }),
    prisma.platformGameMembership.count(),
    prisma.game.count(),
    prisma.game.count({ where: { lastEnrichedAt: { not: null } } }),
    prisma.gamePlatform.count(),
    prisma.releaseDate.count(),
    prisma.gameCompany.count(),
    prisma.gameTag.count(),
    prisma.website.count(),
    prisma.externalGame.count(),
    prisma.gameImage.count(),
    prisma.gameVideo.count(),
    prisma.gameAgeRating.count(),
    prisma.gameScore.count(),
    prisma.wikiPageCache.count(),
    prisma.wikidataEntityCache.count(),
  ]);

  const summaryRow = [
    {
      platforms_total,
      platforms_major,
      platforms_roster_done,
      platforms_wdqs_ingested,
      wiki_roster_memberships,
      games_total,
      games_enriched,
      game_platform_links,
      release_dates,
      game_companies,
      game_tags,
      websites,
      external_games,
      images,
      videos,
      age_ratings,
      scores,
      wiki_pages_cached,
      wikidata_entities_cached,
    },
  ];

  fs.writeFileSync(
    "ingest-summary.csv",
    toCsv(summaryRow, Object.keys(summaryRow[0])),
    "utf8",
  );

  // Per-platform processing
  const rows = await prisma.$queryRaw`
    WITH
      wdqs AS (
        SELECT "platformQid", count(*)::int AS "wdqsCount"
        FROM "GamePlatform"
        GROUP BY 1
      ),
      wiki AS (
        SELECT "platformQid", count(*)::int AS "wikiRosterCount"
        FROM "PlatformGameMembership"
        GROUP BY 1
      ),
      overlap AS (
        SELECT gp."platformQid", count(*)::int AS "overlapCount"
        FROM "GamePlatform" gp
        JOIN "PlatformGameMembership" pm
          ON pm."platformQid" = gp."platformQid"
         AND pm."gameQid"     = gp."gameQid"
        GROUP BY 1
      )
    SELECT
      p."qid"                  AS "platformQid",
      p."name"                 AS "name",
      p."isMajor"              AS "isMajor",
      p."type"                 AS "platformType",
      p."generation"           AS "generation",
      p."releaseYear"          AS "releaseYear",
      p."wikiProjectGameCount" AS "expectedCount",
      COALESCE(wdqs."wdqsCount", 0)        AS "wdqsCount",
      COALESCE(wiki."wikiRosterCount", 0)  AS "wikiRosterCount",
      COALESCE(overlap."overlapCount", 0)  AS "overlapCount",
      (COALESCE(wdqs."wdqsCount", 0) - COALESCE(overlap."overlapCount", 0)) AS "wdqsOnly",
      (COALESCE(wiki."wikiRosterCount", 0) - COALESCE(overlap."overlapCount", 0)) AS "wikiOnly",
      p."gamesRosterFetchedCount" AS "gamesRosterFetchedCount",
      p."gamesRosterDone"         AS "gamesRosterDone",
      p."gamesCursorQid"          AS "gamesCursorQid",
      p."gamesCursorUpdatedAt"    AS "gamesCursorUpdatedAt",
      p."gamesIngestedAt"         AS "gamesIngestedAt",
      p."lastEnrichedAt"          AS "lastEnrichedAt"
    FROM "Platform" p
    LEFT JOIN wdqs    ON wdqs."platformQid" = p."qid"
    LEFT JOIN wiki    ON wiki."platformQid" = p."qid"
    LEFT JOIN overlap ON overlap."platformQid" = p."qid"
    ORDER BY p."isMajor" DESC, "wdqsCount" DESC, p."name" ASC
  `;

  const headers = [
    "platformQid",
    "name",
    "isMajor",
    "platformType",
    "generation",
    "releaseYear",
    "expectedCount",
    "wdqsCount",
    "wikiRosterCount",
    "overlapCount",
    "wdqsOnly",
    "wikiOnly",
    "gamesRosterFetchedCount",
    "gamesRosterDone",
    "gamesCursorQid",
    "gamesCursorUpdatedAt",
    "gamesIngestedAt",
    "lastEnrichedAt",
  ];

  fs.writeFileSync("platform-processing.csv", toCsv(rows, headers), "utf8");

  console.log("Wrote ingest-summary.csv and platform-processing.csv");
} finally {
  await prisma.$disconnect();
  await pool.end();
}
