import pLimit from "p-limit";
import {
  CompanyRole,
  Prisma,
  ReleaseDateCategory,
  TagKind,
} from "@prisma/client";
import { prisma } from "./lib/prisma";
import { WikiClient } from "../wiki/wikiClient";
import {
  getEnglishDescription,
  getEnglishLabel,
  type WikidataClaims,
  type WikidataEntity,
} from "./lib/types";
import {
  extractEntityIds,
  extractReleaseDateClaims,
  extractReleaseYear,
} from "./claims";
import { COMPANY_PROPERTY_SPECS, TAG_PROPERTY_SPECS } from "./claims/whitelist";

const ENTITY_CONCURRENCY = 1;
const DB_BATCH_SIZE = 200;
const ENTITY_DELAY_MS = 120;

interface CliOptions {
  platformQid: string | null;
  maxGames: number | null;
}

interface HydratePayload {
  qid: string;
  entity: WikidataEntity;
  claims: WikidataClaims | undefined;
  title: string;
  description: string | null;
  releaseYear: number | null;
  firstReleaseAt: Date | null;
  sitelinks: number;
  wikiTitleEn: string | null;
  wikiUrlEn: string | null;
  claimsJson: Prisma.InputJsonValue;
}

interface MissingReport {
  totalGames: number;
  missingDescription: number;
  missingReleaseDate: number;
  missingGenre: number;
  missingCompany: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePositiveInt(raw: string | undefined): number | null {
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseCliOptions(argv: string[]): CliOptions {
  const platformArg = argv.find(
    (value) =>
      value.startsWith("--platform=") || value.startsWith("--platform-qid="),
  );
  const maxArg = argv.find((value) => value.startsWith("--max-games="));

  const platformQid = platformArg
    ? platformArg
        .slice(platformArg.indexOf("=") + 1)
        .trim()
        .toUpperCase()
    : process.env.PLATFORM_QID?.trim().toUpperCase() || null;

  if (platformQid && !/^Q\d+$/.test(platformQid)) {
    throw new Error(`Invalid platform QID: ${platformQid}`);
  }

  return {
    platformQid,
    maxGames: parsePositiveInt(
      maxArg?.slice("--max-games=".length) ?? process.env.MAX_GAMES,
    ),
  };
}

function toUtcDate(
  year: number,
  month: number | null,
  day: number | null,
): Date {
  const safeMonth = month ?? 1;
  const safeDay = day ?? 1;
  return new Date(Date.UTC(year, safeMonth - 1, safeDay, 0, 0, 0));
}

function toReleaseDateCategory(
  precision: number | null,
  month: number | null,
  day: number | null,
): ReleaseDateCategory {
  if (precision === 10 && month !== null) return ReleaseDateCategory.YYYYMMMM;
  if (precision === 9) return ReleaseDateCategory.YYYY;
  if (precision !== null && precision < 9) return ReleaseDateCategory.YYYY;

  if (month !== null && day !== null) return ReleaseDateCategory.YYYYMMMMDD;
  if (month !== null) return ReleaseDateCategory.YYYYMMMM;
  return ReleaseDateCategory.YYYY;
}

function buildReleaseDateHuman(value: {
  year: number;
  month: number | null;
  day: number | null;
  category: ReleaseDateCategory;
}): string {
  const pad2 = (n: number) => n.toString().padStart(2, "0");

  if (
    value.category === ReleaseDateCategory.YYYYMMMMDD &&
    value.month !== null &&
    value.day !== null
  ) {
    return `${value.year}-${pad2(value.month)}-${pad2(value.day)}`;
  }

  if (value.category === ReleaseDateCategory.YYYYMMMM && value.month !== null) {
    return `${value.year}-${pad2(value.month)}`;
  }

  return `${value.year}`;
}

function chunk<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size));
  }
  return out;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toWikidataEntity(qid: string, raw: unknown): WikidataEntity {
  if (!isObject(raw)) {
    throw new Error(`Invalid cached entity JSON for ${qid}: expected object`);
  }

  const id = typeof raw.id === "string" ? raw.id : qid;
  return { ...(raw as Record<string, unknown>), id } as WikidataEntity;
}

function buildHydratePayload(
  qid: string,
  entity: WikidataEntity,
): HydratePayload {
  const title = getEnglishLabel(entity) ?? qid;
  const description = getEnglishDescription(entity);
  const claims = entity.claims;
  const releaseYear = extractReleaseYear(claims);
  const releaseClaims = extractReleaseDateClaims(claims);
  const earliestClaim = releaseClaims
    .filter((claim) => claim.year !== null)
    .sort((a, b) => (a.year ?? 0) - (b.year ?? 0))[0];

  const firstReleaseAt = earliestClaim?.year
    ? toUtcDate(earliestClaim.year, earliestClaim.month, earliestClaim.day)
    : null;

  const sitelinks = Object.keys(entity.sitelinks ?? {}).length;
  const enwiki = entity.sitelinks?.enwiki;

  return {
    qid,
    entity,
    claims,
    title,
    description,
    releaseYear,
    firstReleaseAt,
    sitelinks,
    wikiTitleEn: enwiki?.title?.trim() || null,
    wikiUrlEn: enwiki?.url?.trim() || null,
    claimsJson: entity as unknown as Prisma.InputJsonValue,
  };
}

async function upsertGameCore(payload: HydratePayload): Promise<void> {
  await prisma.game.upsert({
    where: { qid: payload.qid },
    update: {
      title: payload.title,
      description: payload.description,
      releaseYear: payload.releaseYear,
      firstReleaseAt: payload.firstReleaseAt,
      claimsJson: payload.claimsJson,
      sitelinks: payload.sitelinks,
      wikiTitleEn: payload.wikiTitleEn,
      wikiUrlEn: payload.wikiUrlEn,
      lastEnrichedAt: new Date(),
    },
    create: {
      qid: payload.qid,
      title: payload.title,
      description: payload.description,
      releaseYear: payload.releaseYear,
      firstReleaseAt: payload.firstReleaseAt,
      claimsJson: payload.claimsJson,
      sitelinks: payload.sitelinks,
      wikiTitleEn: payload.wikiTitleEn,
      wikiUrlEn: payload.wikiUrlEn,
      lastEnrichedAt: new Date(),
    },
  });
}

async function upsertReleaseDates(payload: HydratePayload): Promise<number> {
  const claims = extractReleaseDateClaims(payload.claims);
  if (!claims.length) return 0;

  const rows: Prisma.ReleaseDateCreateManyInput[] = claims
    .filter((claim) => claim.year !== null)
    .map((claim) => {
      const category = toReleaseDateCategory(
        claim.precision,
        claim.month,
        claim.day,
      );
      const year = claim.year as number;

      return {
        gameQid: payload.qid,
        category,
        date: toUtcDate(year, claim.month, claim.day),
        year,
        month: claim.month,
        day: claim.day,
        precision: claim.precision,
        human: buildReleaseDateHuman({
          year,
          month: claim.month,
          day: claim.day,
          category,
        }),
        source: "wikidata:P577",
        claimId: claim.claimId,
      };
    });

  if (!rows.length) return 0;
  const result = await prisma.releaseDate.createMany({
    data: rows,
    skipDuplicates: true,
  });
  return result.count;
}

async function upsertGenres(payload: HydratePayload): Promise<{
  tagsCreated: number;
  gameTagsCreated: number;
}> {
  const genreSpec = TAG_PROPERTY_SPECS.find(
    (spec) => spec.propertyId === "P136",
  );
  if (!genreSpec) return { tagsCreated: 0, gameTagsCreated: 0 };

  const genreIds = extractEntityIds(payload.claims, "P136");
  if (!genreIds.length) return { tagsCreated: 0, gameTagsCreated: 0 };

  const tagRows: Prisma.TagCreateManyInput[] = genreIds.map((qid) => ({
    id: qid,
    kind: TagKind.GENRE,
    label: qid,
    source: genreSpec.source,
  }));

  const tagsCreated = (
    await prisma.tag.createMany({ data: tagRows, skipDuplicates: true })
  ).count;

  const gameTagRows: Prisma.GameTagCreateManyInput[] = genreIds.map(
    (tagId) => ({
      gameQid: payload.qid,
      tagId,
    }),
  );

  const gameTagsCreated = (
    await prisma.gameTag.createMany({ data: gameTagRows, skipDuplicates: true })
  ).count;

  return { tagsCreated, gameTagsCreated };
}

async function upsertCompanies(payload: HydratePayload): Promise<{
  companiesCreated: number;
  linksCreated: number;
}> {
  const companyIds = new Map<string, Set<CompanyRole>>();

  for (const spec of COMPANY_PROPERTY_SPECS) {
    const ids = extractEntityIds(payload.claims, spec.propertyId);
    for (const id of ids) {
      const current = companyIds.get(id) ?? new Set<CompanyRole>();
      current.add(spec.role);
      companyIds.set(id, current);
    }
  }

  if (!companyIds.size) return { companiesCreated: 0, linksCreated: 0 };

  const companyRows: Prisma.CompanyCreateManyInput[] = [
    ...companyIds.keys(),
  ].map((qid) => ({
    qid,
    name: qid,
  }));

  const companiesCreated = (
    await prisma.company.createMany({ data: companyRows, skipDuplicates: true })
  ).count;

  const linkRows: Prisma.GameCompanyCreateManyInput[] = [];
  for (const [companyQid, roles] of companyIds) {
    for (const role of roles) {
      linkRows.push({
        gameQid: payload.qid,
        companyQid,
        role,
      });
    }
  }

  const linksCreated = (
    await prisma.gameCompany.createMany({
      data: linkRows,
      skipDuplicates: true,
    })
  ).count;

  return { companiesCreated, linksCreated };
}

async function attachPlatforms(
  gameQid: string,
  platformQids: string[],
): Promise<number> {
  if (!platformQids.length) return 0;

  const rows: Prisma.GamePlatformCreateManyInput[] = platformQids.map(
    (platformQid) => ({
      gameQid,
      platformQid,
      source: "platform-membership",
    }),
  );

  const result = await prisma.gamePlatform.createMany({
    data: rows,
    skipDuplicates: true,
  });

  return result.count;
}

async function buildMissingReport(gameQids: string[]): Promise<MissingReport> {
  if (!gameQids.length) {
    return {
      totalGames: 0,
      missingDescription: 0,
      missingReleaseDate: 0,
      missingGenre: 0,
      missingCompany: 0,
    };
  }

  const totalGames = await prisma.game.count({
    where: { qid: { in: gameQids } },
  });

  const [missingDescription, withReleaseDate, withGenre, withCompany] =
    await Promise.all([
      prisma.game.count({
        where: {
          qid: { in: gameQids },
          OR: [{ description: null }, { description: "" }],
        },
      }),
      prisma.releaseDate.groupBy({
        by: ["gameQid"],
        where: { gameQid: { in: gameQids } },
      }),
      prisma.gameTag.groupBy({
        by: ["gameQid"],
        where: { gameQid: { in: gameQids } },
      }),
      prisma.gameCompany.groupBy({
        by: ["gameQid"],
        where: { gameQid: { in: gameQids } },
      }),
    ]);

  return {
    totalGames,
    missingDescription,
    missingReleaseDate: totalGames - withReleaseDate.length,
    missingGenre: totalGames - withGenre.length,
    missingCompany: totalGames - withCompany.length,
  };
}

async function main() {
  const startedAt = Date.now();
  const options = parseCliOptions(process.argv.slice(2));

  const memberships = await prisma.platformGameMembership.findMany({
    where: options.platformQid
      ? { platformQid: options.platformQid }
      : undefined,
    select: {
      gameQid: true,
      platformQid: true,
    },
    orderBy: [{ platformQid: "asc" }, { gameQid: "asc" }],
  });

  if (!memberships.length) {
    throw new Error(
      options.platformQid
        ? `No PlatformGameMembership rows found for ${options.platformQid}.`
        : "No PlatformGameMembership rows found.",
    );
  }

  const platformsByGame = new Map<string, Set<string>>();
  for (const row of memberships) {
    const set = platformsByGame.get(row.gameQid) ?? new Set<string>();
    set.add(row.platformQid);
    platformsByGame.set(row.gameQid, set);
  }

  let gameQids = [...platformsByGame.keys()].sort((a, b) => a.localeCompare(b));
  if (options.maxGames !== null) {
    gameQids = gameQids.slice(0, options.maxGames);
  }

  const client = new WikiClient({
    concurrency: ENTITY_CONCURRENCY,
    maxRetries: 5,
    timeoutMs: 30000,
  });
  const limit = pLimit(ENTITY_CONCURRENCY);

  let cacheFetched = 0;
  let cacheHit = 0;
  let gameUpserts = 0;
  let releaseRowsCreated = 0;
  let tagRowsCreated = 0;
  let gameTagRowsCreated = 0;
  let companyRowsCreated = 0;
  let gameCompanyRowsCreated = 0;
  let gamePlatformRowsCreated = 0;
  let hydrateFailures = 0;
  const hydratedQids: string[] = [];

  for (const batch of chunk(gameQids, DB_BATCH_SIZE)) {
    const payloads = await Promise.all(
      batch.map((qid) =>
        limit(async () => {
          try {
            const cached = await client.getOrFetchWikidataEntity(qid);
            if (cached.source === "fetched") cacheFetched += 1;
            else cacheHit += 1;

            const entity = toWikidataEntity(qid, cached.entityJson);
            await sleep(ENTITY_DELAY_MS);
            return buildHydratePayload(qid, entity);
          } catch (error) {
            hydrateFailures += 1;
            console.warn(
              `hydrateGamesFromMembership: failed qid=${qid} error=${error instanceof Error ? error.message : String(error)}`,
            );
            return null;
          }
        }),
      ),
    );

    for (const payload of payloads) {
      if (!payload) continue;

      await upsertGameCore(payload);
      gameUpserts += 1;
      hydratedQids.push(payload.qid);

      releaseRowsCreated += await upsertReleaseDates(payload);

      const genreResult = await upsertGenres(payload);
      tagRowsCreated += genreResult.tagsCreated;
      gameTagRowsCreated += genreResult.gameTagsCreated;

      const companyResult = await upsertCompanies(payload);
      companyRowsCreated += companyResult.companiesCreated;
      gameCompanyRowsCreated += companyResult.linksCreated;

      const platformQids = [
        ...(platformsByGame.get(payload.qid) ?? new Set<string>()),
      ];
      gamePlatformRowsCreated += await attachPlatforms(
        payload.qid,
        platformQids,
      );
    }
  }

  const report = await buildMissingReport(hydratedQids);
  const elapsedMs = Date.now() - startedAt;

  console.log(
    `hydrateGamesFromMembership: scopeGames=${gameQids.length} hydratedGames=${hydratedQids.length} hydrateFailures=${hydrateFailures} cacheFetched=${cacheFetched} cacheHit=${cacheHit} networkCalls=${client.stats.networkCalls} gameUpserts=${gameUpserts} releaseRowsCreated=${releaseRowsCreated} tagRowsCreated=${tagRowsCreated} gameTagRowsCreated=${gameTagRowsCreated} companyRowsCreated=${companyRowsCreated} gameCompanyRowsCreated=${gameCompanyRowsCreated} gamePlatformRowsCreated=${gamePlatformRowsCreated} elapsedMs=${elapsedMs}`,
  );
  console.log(
    `hydrateGamesFromMembership: missingFields total=${report.totalGames} missingDescription=${report.missingDescription} missingReleaseDate=${report.missingReleaseDate} missingGenre=${report.missingGenre} missingCompany=${report.missingCompany}`,
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
