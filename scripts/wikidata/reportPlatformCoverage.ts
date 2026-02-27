import { prisma } from "./lib/prisma";

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

async function main() {
  const platforms = await prisma.platform.findMany({
    where: { wikiProjectGameCount: { not: null } },
    select: {
      qid: true,
      name: true,
      wikiProjectGameCount: true,
      isMajor: true,
    },
    orderBy: [{ wikiProjectGameCount: "desc" }, { qid: "asc" }],
  });

  if (!platforms.length) {
    throw new Error(
      "No seeded platforms found. Run scripts/wikidata/importPlatformGroupings.ts first.",
    );
  }

  const [wdqsCounts, wdqsPairs, wikiPairs] = await Promise.all([
    prisma.gamePlatform.groupBy({
      by: ["platformQid"],
      where: { source: "wikidata:P400" },
      _count: { _all: true },
    }),
    prisma.gamePlatform.findMany({
      where: { source: "wikidata:P400" },
      select: { platformQid: true, gameQid: true },
    }),
    prisma.platformGameMembership.findMany({
      select: { platformQid: true, gameQid: true },
      distinct: ["platformQid", "gameQid"],
    }),
  ]);

  const wdqsByPlatform = new Map<string, number>();
  for (const row of wdqsCounts) {
    wdqsByPlatform.set(row.platformQid, row._count._all);
  }

  const wdqsGamesByPlatform = new Map<string, Set<string>>();
  for (const row of wdqsPairs) {
    const set = wdqsGamesByPlatform.get(row.platformQid) ?? new Set<string>();
    set.add(row.gameQid);
    wdqsGamesByPlatform.set(row.platformQid, set);
  }

  const wikiGamesByPlatform = new Map<string, Set<string>>();
  for (const row of wikiPairs) {
    const set = wikiGamesByPlatform.get(row.platformQid) ?? new Set<string>();
    set.add(row.gameQid);
    wikiGamesByPlatform.set(row.platformQid, set);
  }

  const lines: string[] = [];
  lines.push(
    [
      "platformQid",
      "label",
      "expectedCount",
      "wdqsCount",
      "wikiRosterCount",
      "overlapCount",
      "wdqsOnly",
      "wikiOnly",
      "deltaVsExpected",
      "isMajor",
    ].join(","),
  );

  for (const platform of platforms) {
    const expected = platform.wikiProjectGameCount ?? 0;
    const wdqsCount = wdqsByPlatform.get(platform.qid) ?? 0;
    const wdqsSet = wdqsGamesByPlatform.get(platform.qid) ?? new Set<string>();
    const wikiSet = wikiGamesByPlatform.get(platform.qid) ?? new Set<string>();

    let overlap = 0;
    for (const gameQid of wdqsSet) {
      if (wikiSet.has(gameQid)) overlap += 1;
    }

    const wdqsOnly = wdqsSet.size - overlap;
    const wikiOnly = wikiSet.size - overlap;
    const deltaVsExpected = wdqsCount - expected;

    lines.push(
      [
        platform.qid,
        csvEscape(platform.name),
        String(expected),
        String(wdqsCount),
        String(wikiSet.size),
        String(overlap),
        String(wdqsOnly),
        String(wikiOnly),
        String(deltaVsExpected),
        platform.isMajor ? "true" : "false",
      ].join(","),
    );
  }

  process.stdout.write(lines.join("\n"));
  process.stdout.write("\n");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
