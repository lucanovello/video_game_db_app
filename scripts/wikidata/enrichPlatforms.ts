import { PlatformType, Prisma } from "@prisma/client";
import { CONFIG } from "./lib/config";
import { chunk } from "./lib/http";
import { prisma } from "./lib/prisma";
import {
  extractEntityIds,
  extractReleaseDateClaims,
  extractStringClaims,
} from "./claims";
import { wbGetEntitiesFull, wbGetEntitiesLabels } from "./lib/wikidataApi";
import {
  getEnglishDescription,
  getEnglishLabel,
  type WikidataClaims,
  type WikidataEntity,
} from "./lib/types";

interface CliOptions {
  enrichAll: boolean;
  limit: number | null;
}

interface PlatformTarget {
  qid: string;
  name: string;
}

interface PlatformUpdate {
  qid: string;
  data: Prisma.PlatformUpdateInput;
}

function parseCliOptions(argv: string[]): CliOptions {
  const limitArg = argv.find((item) => item.startsWith("--limit="));
  const limitRaw = limitArg?.slice("--limit=".length) ?? "";
  const limitParsed = Number.parseInt(limitRaw, 10);

  return {
    enrichAll: argv.includes("--all"),
    limit: Number.isFinite(limitParsed) && limitParsed > 0 ? limitParsed : null,
  };
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function toClaimsJson(
  value: unknown,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function getEnglishAlias(entity: WikidataEntity, name: string): string | null {
  const englishAliases = entity.aliases?.en ?? [];
  for (const alias of englishAliases) {
    const value = alias?.value?.trim();
    if (value && value.toLowerCase() !== name.toLowerCase()) {
      return value;
    }
  }

  const fallbackGroups = Object.values(entity.aliases ?? {});
  for (const group of fallbackGroups) {
    for (const alias of group ?? []) {
      const value = alias?.value?.trim();
      if (value && value.toLowerCase() !== name.toLowerCase()) {
        return value;
      }
    }
  }

  return null;
}

function toUtcDate(
  year: number,
  month: number | null,
  day: number | null,
): Date {
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1, 0, 0, 0));
}

function extractFirstReleaseAt(
  claims: WikidataClaims | undefined,
): Date | null {
  let earliest: Date | null = null;

  for (const claim of extractReleaseDateClaims(claims)) {
    if (claim.year === null) continue;
    const candidate = toUtcDate(claim.year, claim.month, claim.day);
    if (!earliest || candidate < earliest) {
      earliest = candidate;
    }
  }

  return earliest;
}

function inferPlatformTypeFromLabels(labels: string[]): PlatformType {
  const lowered = labels.map((label) => label.toLowerCase());
  const contains = (value: string) =>
    lowered.some((label) => label.includes(value));

  if (contains("handheld") || contains("portable"))
    return PlatformType.HANDHELD;
  if (contains("hybrid")) return PlatformType.HYBRID;
  if (contains("arcade")) return PlatformType.ARCADE;
  if (contains("mobile") || contains("smartphone") || contains("cell phone")) {
    return PlatformType.MOBILE;
  }
  if (
    contains("computer") ||
    contains("operating system") ||
    contains("microcomputer")
  ) {
    return PlatformType.COMPUTER;
  }
  if (contains("cloud") || contains("streaming")) return PlatformType.CLOUD;
  if (contains("service") || contains("network")) return PlatformType.SERVICE;
  if (contains("console")) return PlatformType.HOME_CONSOLE;

  return PlatformType.OTHER;
}

async function fetchTypeLabelMap(
  entities: WikidataEntity[],
): Promise<Map<string, string>> {
  const typeIds = new Set<string>();

  for (const entity of entities) {
    for (const propertyId of ["P31", "P279"]) {
      const ids = extractEntityIds(entity.claims, propertyId);
      for (const id of ids) typeIds.add(id);
    }
  }

  const map = new Map<string, string>();
  for (const ids of chunk([...typeIds], CONFIG.enrichBatchSize)) {
    const response = await wbGetEntitiesLabels(ids);

    for (const id of ids) {
      const entity = response.entities[id];
      if (!entity || entity.missing) continue;

      const label = getEnglishLabel(entity)?.trim();
      if (label) map.set(id, label);
    }
  }

  return map;
}

function buildPlatformUpdate(
  target: PlatformTarget,
  entity: WikidataEntity,
  typeLabels: Map<string, string>,
): PlatformUpdate {
  const name = getEnglishLabel(entity) ?? target.name;
  const description = getEnglishDescription(entity);
  const abbreviation =
    extractStringClaims(entity.claims, "P1813")[0]?.value ?? null;
  const alternativeName = getEnglishAlias(entity, name);
  const officialUrl =
    extractStringClaims(entity.claims, "P856")[0]?.value ?? null;
  const firstReleaseAt = extractFirstReleaseAt(entity.claims);
  const releaseYear =
    extractReleaseDateClaims(entity.claims)
      .map((claim) => claim.year)
      .filter((year): year is number => year !== null)
      .sort((left, right) => left - right)[0] ?? null;

  const typeHints: string[] = [];
  for (const propertyId of ["P31", "P279"]) {
    for (const id of extractEntityIds(entity.claims, propertyId)) {
      const label = typeLabels.get(id);
      if (label) typeHints.push(label);
    }
  }

  if (name) typeHints.push(name);
  if (description) typeHints.push(description);

  const type = inferPlatformTypeFromLabels(typeHints);
  const sitelinks = Object.keys(entity.sitelinks ?? {}).length;

  return {
    qid: target.qid,
    data: {
      name,
      abbreviation,
      alternativeName,
      description,
      summary: description,
      slug: slugify(name),
      url:
        officialUrl ||
        entity.sitelinks?.enwiki?.url ||
        (entity.sitelinks?.enwiki?.title
          ? `https://en.wikipedia.org/wiki/${encodeURIComponent(entity.sitelinks.enwiki.title)}`
          : null),
      type,
      firstReleaseAt,
      releaseYear,
      sitelinks,
      claimsJson: toClaimsJson(entity.claims ?? null),
      lastEnrichedAt: new Date(),
    },
  };
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2));

  const targets = await prisma.platform.findMany({
    where: options.enrichAll
      ? undefined
      : {
          OR: [
            { name: { startsWith: "Q" } },
            { description: null },
            { type: null },
            { lastEnrichedAt: null },
          ],
        },
    orderBy: [{ sitelinks: "desc" }, { qid: "asc" }],
    take: options.limit ?? undefined,
    select: { qid: true, name: true },
  });

  if (!targets.length) {
    console.log("enrichPlatforms: no platforms to enrich");
    return;
  }

  let updated = 0;

  for (const batch of chunk(targets, CONFIG.enrichBatchSize)) {
    const qids = batch.map((platform) => platform.qid);
    const response = await wbGetEntitiesFull(qids);

    const entities = qids
      .map((qid) => response.entities[qid])
      .filter((entity): entity is WikidataEntity =>
        Boolean(entity && !entity.missing),
      );

    const typeLabels = await fetchTypeLabelMap(entities);
    const updates: Prisma.PrismaPromise<unknown>[] = [];

    for (const target of batch) {
      const entity = response.entities[target.qid];
      if (!entity || entity.missing) continue;

      const update = buildPlatformUpdate(target, entity, typeLabels);
      updates.push(
        prisma.platform.update({
          where: { qid: update.qid },
          data: update.data,
        }),
      );
    }

    if (updates.length) {
      await prisma.$transaction(updates);
      updated += updates.length;
      console.log(
        `enrichPlatforms: updatedBatch=${updates.length} totalUpdated=${updated}/${targets.length}`,
      );
    }
  }

  console.log(
    `enrichPlatforms: done updated=${updated} scanned=${targets.length}`,
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
