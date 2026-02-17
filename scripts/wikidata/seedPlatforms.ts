import type { Prisma } from "@prisma/client";
import { prisma } from "./lib/prisma";
import { wdqs } from "./lib/wdqs";
import { getBindingString, type WdqsBinding } from "./lib/types";

const CONSOLE_PLATFORMS_QUERY = `
SELECT DISTINCT ?platform ?platformQid ?platformLabel ?platformDescription ?sitelinks WHERE {
  ?platform wdt:P31/wdt:P279* wd:Q8076 .
  BIND(STRAFTER(STR(?platform), "http://www.wikidata.org/entity/") AS ?platformQid)
  OPTIONAL { ?platform wikibase:sitelinks ?sitelinks . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY DESC(?sitelinks) ?platformQid
`;

interface SeedPlatformRow {
  qid: string;
  name: string;
  description: string | null;
  sitelinks: number;
}

function toInt(value: string | null): number {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseRow(binding: WdqsBinding): SeedPlatformRow | null {
  const qid = getBindingString(binding, "platformQid");
  if (!qid || !qid.startsWith("Q")) return null;

  const label = getBindingString(binding, "platformLabel");
  if (!label) return null;

  const description = getBindingString(binding, "platformDescription");
  const sitelinks = toInt(getBindingString(binding, "sitelinks"));

  return {
    qid,
    name: label.trim(),
    description: description?.trim() || null,
    sitelinks,
  };
}

function dedupePlatforms(bindings: WdqsBinding[]): SeedPlatformRow[] {
  const map = new Map<string, SeedPlatformRow>();

  for (const binding of bindings) {
    const parsed = parseRow(binding);
    if (!parsed) continue;

    const current = map.get(parsed.qid);
    if (!current || parsed.sitelinks > current.sitelinks) {
      map.set(parsed.qid, parsed);
    }
  }

  return [...map.values()].sort(
    (a, b) => b.sitelinks - a.sitelinks || a.qid.localeCompare(b.qid),
  );
}

async function main() {
  const response = await wdqs(CONSOLE_PLATFORMS_QUERY);
  const platforms = dedupePlatforms(response.results.bindings);

  if (!platforms.length) {
    throw new Error("No console platforms returned by WDQS");
  }

  const qids = platforms.map((platform) => platform.qid);
  const existing = await prisma.platform.findMany({
    where: { qid: { in: qids } },
    select: { qid: true, name: true, description: true, sitelinks: true },
  });
  const existingByQid = new Map(existing.map((row) => [row.qid, row] as const));

  const toCreate: Prisma.PlatformCreateManyInput[] = [];
  const toUpdate: Prisma.PrismaPromise<unknown>[] = [];

  for (const platform of platforms) {
    const current = existingByQid.get(platform.qid);
    if (!current) {
      toCreate.push(platform);
      continue;
    }

    if (
      current.name !== platform.name ||
      current.description !== platform.description ||
      current.sitelinks !== platform.sitelinks
    ) {
      toUpdate.push(
        prisma.platform.update({
          where: { qid: platform.qid },
          data: {
            name: platform.name,
            description: platform.description,
            sitelinks: platform.sitelinks,
          },
        }),
      );
    }
  }

  if (toCreate.length) {
    await prisma.platform.createMany({
      data: toCreate,
      skipDuplicates: true,
    });
  }

  if (toUpdate.length) {
    await prisma.$transaction(toUpdate);
  }

  const total = await prisma.platform.count();
  console.log(
    `seedPlatforms: fetched=${platforms.length} created=${toCreate.length} updated=${toUpdate.length} total=${total}`,
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
