import { CONFIG } from "../lib/config";
import { prisma } from "../lib/prisma";

function uniqueQids(qids: string[]): string[] {
  return [...new Set(qids.filter((qid) => qid.startsWith("Q")))];
}

async function main() {
  const totalPlatforms = await prisma.platform.count();
  if (!totalPlatforms) {
    throw new Error(
      "No platforms found. Run scripts/wikidata/commands/seedPlatforms.ts first.",
    );
  }

  const ranked = await prisma.platform.findMany({
    where: { sitelinks: { gte: CONFIG.majorPlatformsMinSitelinks } },
    orderBy: [{ sitelinks: "desc" }, { name: "asc" }],
    take: CONFIG.majorPlatformsTopN,
    select: { qid: true },
  });

  const majorQids = uniqueQids([
    ...ranked.map((platform) => platform.qid),
    ...CONFIG.majorPlatformIncludeQids,
  ]);

  await prisma.$transaction([
    prisma.platform.updateMany({ data: { isMajor: false } }),
    prisma.platform.updateMany({
      where: { qid: { in: majorQids } },
      data: { isMajor: true },
    }),
  ]);

  const majorPlatforms = await prisma.platform.findMany({
    where: { isMajor: true },
    orderBy: [{ sitelinks: "desc" }, { name: "asc" }],
    select: { qid: true, name: true, sitelinks: true },
  });

  console.log(
    `setMajorPlatforms: major=${majorPlatforms.length}/${totalPlatforms} (topN=${CONFIG.majorPlatformsTopN}, minSitelinks=${CONFIG.majorPlatformsMinSitelinks})`,
  );
  for (const platform of majorPlatforms.slice(0, 20)) {
    console.log(`${platform.qid} | ${platform.sitelinks} | ${platform.name}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
