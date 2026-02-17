import { prisma } from "../lib/prisma";

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
      "No seeded platforms found. Run scripts/wikidata/commands/importPlatformGroupings.ts first.",
    );
  }

  const counts = await prisma.gamePlatform.groupBy({
    by: ["platformQid"],
    _count: { _all: true },
  });

  const actualByPlatform = new Map<string, number>();
  for (const row of counts) {
    actualByPlatform.set(row.platformQid, row._count._all);
  }

  const lines: string[] = [];
  lines.push(
    [
      "platformQid",
      "label",
      "expectedCount",
      "actualCount",
      "delta",
      "isMajor",
    ].join(","),
  );

  for (const platform of platforms) {
    const expected = platform.wikiProjectGameCount ?? 0;
    const actual = actualByPlatform.get(platform.qid) ?? 0;
    const delta = actual - expected;

    lines.push(
      [
        platform.qid,
        csvEscape(platform.name),
        String(expected),
        String(actual),
        String(delta),
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
