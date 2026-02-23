import pLimit from "p-limit";
import { chunk } from "./lib/http";
import { prisma } from "./lib/prisma";
import { getEnglishDescription, getEnglishLabel } from "./lib/types";
import { wbGetPropertyEntities } from "./lib/wikidataApi";

interface CliOptions {
  topN: number | null;
  batchSize: number;
  concurrency: number;
  propertyIds: string[];
  hydrateAll: boolean;
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

function isPropertyId(value: string): boolean {
  return /^P\d+$/.test(value);
}

function parsePropertyIdCsv(raw: string | undefined): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((item) => item.trim())
        .filter(isPropertyId),
    ),
  ];
}

function parseCliOptions(argv: string[]): CliOptions {
  const topNArg = argv.find((value) => value.startsWith("--top-n="));
  const batchArg = argv.find((value) => value.startsWith("--batch-size="));
  const concurrencyArg = argv.find((value) =>
    value.startsWith("--concurrency="),
  );
  const propertyIdsArg = argv.find((value) =>
    value.startsWith("--property-ids="),
  );
  const hydrateAll = argv.includes("--all");

  return {
    topN: parseOptionalPositiveInt(topNArg?.slice("--top-n=".length)),
    batchSize: parsePositiveInt(batchArg?.slice("--batch-size=".length), 50),
    concurrency: parsePositiveInt(
      concurrencyArg?.slice("--concurrency=".length),
      2,
    ),
    propertyIds: parsePropertyIdCsv(
      propertyIdsArg?.slice("--property-ids=".length),
    ),
    hydrateAll,
  };
}

async function resolvePropertyIds(options: CliOptions): Promise<string[]> {
  if (options.propertyIds.length) return options.propertyIds;

  const rows =
    options.hydrateAll || options.topN === null
      ? await prisma.propertyUsage.findMany({
          orderBy: [{ propertyId: "asc" }],
          select: { propertyId: true },
        })
      : await prisma.propertyUsage.findMany({
          orderBy: [
            { coveragePct: "desc" },
            { gamesWithProperty: "desc" },
            { propertyId: "asc" },
          ],
          take: options.topN,
          select: { propertyId: true },
        });

  return rows.map((row) => row.propertyId);
}

async function hydrateMetadataBatch(propertyIds: string[]): Promise<number> {
  const response = await wbGetPropertyEntities(propertyIds);

  let updated = 0;
  await prisma.$transaction(
    propertyIds.map((propertyId) => {
      const entity = response.entities[propertyId];
      const labelEn = entity ? getEnglishLabel(entity) : null;
      const descriptionEn = entity ? getEnglishDescription(entity) : null;
      const datatype = entity?.datatype?.trim() || null;

      if (entity && !entity.missing) {
        updated += 1;
      }

      return prisma.wikidataProperty.upsert({
        where: { propertyId },
        create: {
          propertyId,
          labelEn,
          descriptionEn,
          datatype,
        },
        update: {
          labelEn,
          descriptionEn,
          datatype,
        },
      });
    }),
  );

  return updated;
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const propertyIds = await resolvePropertyIds(options);

  if (!propertyIds.length) {
    throw new Error(
      "hydratePropertyMetadata: no properties to hydrate. Run wd:analyze-props first or pass --property-ids=P31,P577",
    );
  }

  console.log(
    `hydratePropertyMetadata: start properties=${propertyIds.length} batchSize=${options.batchSize} concurrency=${options.concurrency}`,
  );

  const limit = pLimit(Math.max(1, options.concurrency));
  const batches = chunk(propertyIds, options.batchSize);

  let processed = 0;
  let updated = 0;

  await Promise.all(
    batches.map((ids) =>
      limit(async () => {
        const updatedInBatch = await hydrateMetadataBatch(ids);
        processed += ids.length;
        updated += updatedInBatch;

        console.log(
          `hydratePropertyMetadata: processed=${processed}/${propertyIds.length} updated=${updated}`,
        );
      }),
    ),
  );

  console.log(
    `hydratePropertyMetadata: done properties=${propertyIds.length} entitiesFound=${updated}`,
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
