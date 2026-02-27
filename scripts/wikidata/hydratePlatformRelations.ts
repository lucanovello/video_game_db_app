import { Prisma } from "@prisma/client";
import { prisma } from "./lib/prisma";
import { wbGetEntitiesLabels } from "./lib/wikidataApi";
import { getEnglishDescription, getEnglishLabel } from "./lib/types";

const BATCH_SIZE = 300;

interface ClaimStatement {
  mainsnak?: {
    snaktype?: string;
    datavalue?: {
      value?: unknown;
    };
  };
  id?: string;
}

interface ClaimsRecord {
  [propertyId: string]: ClaimStatement[] | undefined;
}

interface ParsedPlatformRelations {
  platformQid: string;
  controllerQids: string[];
  familyQids: string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asClaimsRecord(value: Prisma.JsonValue | null): ClaimsRecord | null {
  if (!value || !isObject(value)) return null;
  return value as unknown as ClaimsRecord;
}

function extractItemQids(
  claims: ClaimsRecord | null,
  propertyId: string,
): string[] {
  if (!claims) return [];
  const statements = claims[propertyId];
  if (!Array.isArray(statements)) return [];

  const values = new Set<string>();
  for (const statement of statements) {
    if (!statement || statement.mainsnak?.snaktype !== "value") continue;
    const rawValue = statement.mainsnak.datavalue?.value;
    if (!isObject(rawValue)) continue;
    const id = rawValue.id;
    if (typeof id === "string" && /^Q\d+$/.test(id)) {
      values.add(id);
    }
  }

  return [...values].sort((a, b) => a.localeCompare(b));
}

function chunk<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size));
  }
  return out;
}

async function fetchEntityLabelMap(
  qids: string[],
): Promise<Map<string, { label: string; description: string | null }>> {
  const map = new Map<string, { label: string; description: string | null }>();
  if (!qids.length) return map;

  for (const batch of chunk(qids, 50)) {
    const response = await wbGetEntitiesLabels(batch);

    for (const qid of batch) {
      const entity = response.entities[qid];
      if (!entity || entity.missing) continue;

      map.set(qid, {
        label: getEnglishLabel(entity) ?? qid,
        description: getEnglishDescription(entity),
      });
    }
  }

  return map;
}

async function upsertBatch(rows: ParsedPlatformRelations[]): Promise<void> {
  const allControllerQids = [
    ...new Set(rows.flatMap((row) => row.controllerQids)),
  ];
  const allFamilyQids = [...new Set(rows.flatMap((row) => row.familyQids))];

  const [controllerLabels, familyLabels] = await Promise.all([
    fetchEntityLabelMap(allControllerQids),
    fetchEntityLabelMap(allFamilyQids),
  ]);

  await prisma.$transaction(async (tx) => {
    if (allControllerQids.length) {
      await tx.controller.createMany({
        data: allControllerQids.map((qid) => {
          const label = controllerLabels.get(qid);
          return {
            qid,
            name: label?.label ?? qid,
            description: label?.description ?? null,
            source: "wikidata:P479",
          };
        }),
        skipDuplicates: true,
      });
    }

    if (allFamilyQids.length) {
      await tx.platformFamily.createMany({
        data: allFamilyQids.map((qid) => {
          const label = familyLabels.get(qid);
          return {
            qid,
            name: label?.label ?? qid,
            description: label?.description ?? null,
            source: "wikidata:P361",
          };
        }),
        skipDuplicates: true,
      });
    }

    const platformQids = rows.map((row) => row.platformQid);
    await tx.platformController.deleteMany({
      where: { platformQid: { in: platformQids } },
    });
    await tx.platformFamilyMember.deleteMany({
      where: { platformQid: { in: platformQids } },
    });

    const controllerLinks = rows.flatMap((row) =>
      row.controllerQids.map((controllerQid) => ({
        platformQid: row.platformQid,
        controllerQid,
        source: "wikidata:P479",
      })),
    );

    const familyLinks = rows.flatMap((row) =>
      row.familyQids.map((familyQid) => ({
        platformQid: row.platformQid,
        familyQid,
        source: "wikidata:P361",
      })),
    );

    if (controllerLinks.length) {
      await tx.platformController.createMany({
        data: controllerLinks,
        skipDuplicates: true,
      });
    }

    if (familyLinks.length) {
      await tx.platformFamilyMember.createMany({
        data: familyLinks,
        skipDuplicates: true,
      });
    }
  });
}

async function main() {
  let cursorQid: string | null = null;
  let processed = 0;

  for (;;) {
    const platforms: Array<{
      qid: string;
      claimsJson: Prisma.JsonValue | null;
    }> = await prisma.platform.findMany({
      where: cursorQid ? { qid: { gt: cursorQid } } : undefined,
      orderBy: { qid: "asc" },
      take: BATCH_SIZE,
      select: { qid: true, claimsJson: true },
    });

    if (!platforms.length) break;

    const rows: ParsedPlatformRelations[] = platforms.map((platform) => {
      const claims = asClaimsRecord(platform.claimsJson);
      return {
        platformQid: platform.qid,
        controllerQids: extractItemQids(claims, "P479"),
        familyQids: extractItemQids(claims, "P361"),
      };
    });

    await upsertBatch(rows);

    processed += rows.length;
    cursorQid = platforms[platforms.length - 1]?.qid ?? cursorQid;

    const controllerLinks = rows.reduce(
      (sum, row) => sum + row.controllerQids.length,
      0,
    );
    const familyLinks = rows.reduce(
      (sum, row) => sum + row.familyQids.length,
      0,
    );

    console.log(
      `hydratePlatformRelations: batch=${rows.length} processed=${processed} controllerLinks=${controllerLinks} familyLinks=${familyLinks} cursor=${cursorQid}`,
    );
  }

  console.log(`hydratePlatformRelations: done processed=${processed}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
