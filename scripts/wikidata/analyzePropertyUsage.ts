import { Prisma } from "@prisma/client";
import { prisma } from "./lib/prisma";

interface CliOptions {
  batchSize: number;
  sampleSize: number;
  maxGames: number | null;
  mode: "truncate" | "upsert";
}

interface PropertyAccumulator {
  gamesWithProperty: number;
  totalStatements: number;
  sampleGameIds: string[];
}

interface GameClaimsRow {
  qid: string;
  claimsJson: Prisma.JsonValue;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseOptionalPositiveInt(raw: string | undefined): number | null {
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseCliOptions(argv: string[]): CliOptions {
  const batchArg = argv.find((value) => value.startsWith("--batch-size="));
  const sampleArg = argv.find((value) => value.startsWith("--sample-size="));
  const maxGamesArg = argv.find((value) => value.startsWith("--max-games="));
  const modeArg = argv.find((value) => value.startsWith("--mode="));

  const modeRaw = modeArg?.slice("--mode=".length).trim().toLowerCase();
  const mode = modeRaw === "upsert" ? "upsert" : "truncate";

  return {
    batchSize: parsePositiveInt(batchArg?.slice("--batch-size=".length), 2000),
    sampleSize: parsePositiveInt(sampleArg?.slice("--sample-size=".length), 5),
    maxGames: parseOptionalPositiveInt(
      maxGamesArg?.slice("--max-games=".length),
    ),
    mode,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPropertyId(value: string): boolean {
  return /^P\d+$/.test(value);
}

function getStatementCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  return 0;
}

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];

  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

async function ensurePropertyRows(propertyIds: string[]): Promise<void> {
  if (!propertyIds.length) return;

  for (const group of chunk(propertyIds, 1000)) {
    await prisma.wikidataProperty.createMany({
      data: group.map((propertyId) => ({
        propertyId,
      })),
      skipDuplicates: true,
    });
  }
}

async function writeUsageRows(
  usageByProperty: Map<string, PropertyAccumulator>,
  totalGames: number,
  mode: "truncate" | "upsert",
): Promise<void> {
  const propertyIds = [...usageByProperty.keys()].sort((a, b) =>
    a.localeCompare(b),
  );
  await ensurePropertyRows(propertyIds);

  const computedAt = new Date();
  const rows = [...usageByProperty.entries()]
    .map(([propertyId, stats]) => ({
      propertyId,
      gamesWithProperty: stats.gamesWithProperty,
      coveragePct: totalGames > 0 ? stats.gamesWithProperty / totalGames : 0,
      totalStatements: stats.totalStatements,
      sampleGameIds: stats.sampleGameIds,
      computedAt,
    }))
    .sort(
      (a, b) =>
        b.gamesWithProperty - a.gamesWithProperty ||
        b.totalStatements - a.totalStatements ||
        a.propertyId.localeCompare(b.propertyId),
    );

  if (mode === "truncate") {
    await prisma.propertyUsage.deleteMany({});
    for (const group of chunk(rows, 1000)) {
      await prisma.propertyUsage.createMany({ data: group });
    }
    return;
  }

  for (const group of chunk(rows, 500)) {
    await prisma.$transaction(
      group.map((row) =>
        prisma.propertyUsage.upsert({
          where: { propertyId: row.propertyId },
          create: row,
          update: {
            gamesWithProperty: row.gamesWithProperty,
            coveragePct: row.coveragePct,
            totalStatements: row.totalStatements,
            sampleGameIds: row.sampleGameIds,
            computedAt: row.computedAt,
          },
        }),
      ),
    );
  }
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const totalGames = await prisma.game.count();

  console.log(
    `analyzePropertyUsage: start totalGames=${totalGames} batchSize=${options.batchSize} mode=${options.mode}`,
  );

  const usageByProperty = new Map<string, PropertyAccumulator>();
  let cursorQid: string | null = null;
  let scannedGames = 0;

  for (;;) {
    const remaining =
      options.maxGames !== null
        ? Math.max(options.maxGames - scannedGames, 0)
        : null;

    if (remaining !== null && remaining <= 0) break;

    const batch: GameClaimsRow[] = await prisma.game.findMany({
      where: cursorQid ? { qid: { gt: cursorQid } } : undefined,
      orderBy: { qid: "asc" },
      take:
        remaining === null
          ? options.batchSize
          : Math.min(options.batchSize, remaining),
      select: {
        qid: true,
        claimsJson: true,
      },
    });

    if (!batch.length) break;

    for (const game of batch) {
      scannedGames += 1;

      if (!isObject(game.claimsJson)) continue;

      const seenProperties = new Set<string>();

      for (const [propertyId, propertyStatements] of Object.entries(
        game.claimsJson,
      )) {
        if (!isPropertyId(propertyId)) continue;

        const statementsCount = getStatementCount(propertyStatements);
        if (statementsCount <= 0) continue;

        let stats = usageByProperty.get(propertyId);
        if (!stats) {
          stats = {
            gamesWithProperty: 0,
            totalStatements: 0,
            sampleGameIds: [],
          };
          usageByProperty.set(propertyId, stats);
        }

        if (!seenProperties.has(propertyId)) {
          seenProperties.add(propertyId);
          stats.gamesWithProperty += 1;
          if (stats.sampleGameIds.length < options.sampleSize) {
            stats.sampleGameIds.push(game.qid);
          }
        }

        stats.totalStatements += statementsCount;
      }
    }

    cursorQid = batch[batch.length - 1]?.qid ?? cursorQid;

    console.log(
      `analyzePropertyUsage: scanned=${scannedGames} properties=${usageByProperty.size} cursor=${cursorQid}`,
    );
  }

  await writeUsageRows(usageByProperty, totalGames, options.mode);

  const topRows = [...usageByProperty.entries()]
    .map(([propertyId, stats]) => ({
      propertyId,
      gamesWithProperty: stats.gamesWithProperty,
      coveragePct: totalGames > 0 ? stats.gamesWithProperty / totalGames : 0,
      totalStatements: stats.totalStatements,
    }))
    .sort(
      (a, b) =>
        b.coveragePct - a.coveragePct ||
        b.gamesWithProperty - a.gamesWithProperty ||
        a.propertyId.localeCompare(b.propertyId),
    )
    .slice(0, 50);

  console.log("analyzePropertyUsage: top 50 properties by coverage");
  for (const row of topRows) {
    console.log(
      `  ${row.propertyId} coverage=${(row.coveragePct * 100).toFixed(2)}% games=${row.gamesWithProperty} statements=${row.totalStatements}`,
    );
  }

  console.log(
    `analyzePropertyUsage: done scanned=${scannedGames} uniqueProperties=${usageByProperty.size}`,
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
