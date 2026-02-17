import type { Prisma } from "@prisma/client";
import { CONFIG } from "./lib/config";
import { chunk } from "./lib/http";
import { prisma } from "./lib/prisma";
import { wbGetEntitiesLabels } from "./lib/wikidataApi";
import { getEnglishDescription, getEnglishLabel } from "./lib/types";

function isQidTitle(value: string) {
  return /^Q\d+$/.test(value.trim());
}

async function main() {
  const targets = await prisma.platform.findMany({
    where: {
      OR: [{ name: { startsWith: "Q" } }, { description: null }],
    },
    orderBy: [{ sitelinks: "desc" }, { name: "asc" }],
    select: { qid: true, name: true, description: true },
  });

  const needingBackfill = targets.filter(
    (platform) => isQidTitle(platform.name) || platform.description === null,
  );

  if (!needingBackfill.length) {
    console.log("backfillPlatforms: nothing to backfill");
    return;
  }

  let updated = 0;

  for (const batch of chunk(
    needingBackfill.map((platform) => platform.qid),
    CONFIG.enrichBatchSize,
  )) {
    const response = await wbGetEntitiesLabels(batch);
    const updates: Prisma.PrismaPromise<unknown>[] = [];

    for (const qid of batch) {
      const entity = response.entities[qid];
      if (!entity || entity.missing) continue;

      const name = getEnglishLabel(entity);
      const description = getEnglishDescription(entity);
      if (!name && !description) continue;

      updates.push(
        prisma.platform.update({
          where: { qid },
          data: {
            ...(name ? { name } : {}),
            ...(description ? { description } : {}),
          },
        }),
      );
    }

    if (updates.length) {
      await prisma.$transaction(updates);
      updated += updates.length;
    }
  }

  const remaining = await prisma.platform.count({
    where: { name: { startsWith: "Q" } },
  });

  console.log(
    `backfillPlatforms: updated=${updated} remainingQidNamed=${remaining}`,
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
