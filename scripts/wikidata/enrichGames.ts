import pLimit from "p-limit";
import {
  ExternalGameCategory,
  CompanyRole,
  GameImageKind,
  Prisma,
  ReleaseDateCategory,
  ScoreProvider,
  TagKind,
  VideoProvider,
  WebsiteCategory,
} from "@prisma/client";
import { CONFIG } from "./lib/config";
import { chunk } from "./lib/http";
import { prisma } from "./lib/prisma";
import {
  commonsFileUrl,
  wbGetEntitiesFull,
  wbGetEntitiesLabels,
} from "./lib/wikidataApi";
import {
  getEnglishDescription,
  getEnglishLabel,
  type WikidataClaims,
  type WikidataEntity,
} from "./lib/types";
import {
  extractEntityIds,
  extractImageCommons,
  extractImageCommonsFiles,
  extractQuantityClaims,
  extractReleaseDateClaims,
  extractReleaseYear,
  extractStringClaims,
} from "./claims";
import { COMPANY_PROPERTY_SPECS, TAG_PROPERTY_SPECS } from "./claims/whitelist";

interface CliOptions {
  enrichAllGames: boolean;
  minimal: boolean;
}

interface CandidateGame {
  qid: string;
  title: string;
}

interface EntityLabelInfo {
  label: string;
  description: string | null;
}

interface ParsedTagLink {
  gameQid: string;
  tagId: string;
  kind: TagKind;
  source: string;
}

interface ParsedCompanyLink {
  gameQid: string;
  companyQid: string;
  role: CompanyRole;
}

interface ParsedGameUpdate {
  qid: string;
  title: string;
  description: string | null;
  storyline: string | null;
  imageCommons: string | null;
  imageUrl: string | null;
  releaseYear: number | null;
  firstReleaseAt: Date | null;
  claimsJson: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  sitelinks: number;
  wikiTitleEn: string | null;
  wikiUrlEn: string | null;
  aggregatedRating: number | null;
  aggregatedRatingCount: number | null;
}

interface BatchStats {
  games: number;
  tags: number;
  companies: number;
  gameTags: number;
  gameCompanies: number;
  releaseDates: number;
  websites: number;
  images: number;
  alternativeNames: number;
  externalGames: number;
  videos: number;
  scores: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getNestedCode(error: unknown): string | null {
  if (!isObject(error)) return null;

  const directCode = error["code"];
  if (typeof directCode === "string") return directCode;

  const cause = error["cause"];
  if (!isObject(cause)) return null;

  const causeCode = cause["code"];
  if (typeof causeCode === "string") return causeCode;

  const originalCode = cause["originalCode"];
  if (typeof originalCode === "string") return originalCode;

  return null;
}

function isRetriableDbError(error: unknown): boolean {
  const code = getNestedCode(error);
  if (code === "40P01" || code === "40001") return true;

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("deadlock detected") ||
      message.includes("could not serialize access")
    );
  }

  return false;
}

async function withDbRetry<T>(
  run: () => Promise<T>,
  label: string,
  retries = 4,
): Promise<T> {
  let backoffMs = 200;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (!isRetriableDbError(error) || attempt >= retries) {
        throw error;
      }

      console.warn(
        `enrichGames: retrying ${label} after db conflict (attempt ${attempt + 1}/${retries + 1})`,
      );
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      backoffMs = Math.min(backoffMs * 2, 3000);
    }
  }

  throw new Error(`enrichGames: retry loop ended unexpectedly for ${label}`);
}

const TAG_PROPERTY_MAP = TAG_PROPERTY_SPECS;
const COMPANY_PROPERTY_MAP = COMPANY_PROPERTY_SPECS;

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
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

function toUtcDate(
  year: number,
  month: number | null,
  day: number | null,
): Date {
  const safeMonth = month ?? 1;
  const safeDay = day ?? 1;
  return new Date(Date.UTC(year, safeMonth - 1, safeDay, 0, 0, 0));
}

function parseReleaseDates(
  gameQid: string,
  claims: WikidataClaims | undefined,
): Prisma.ReleaseDateCreateManyInput[] {
  const out: Prisma.ReleaseDateCreateManyInput[] = [];

  for (const claim of extractReleaseDateClaims(claims)) {
    if (claim.year === null) continue;

    const category = toReleaseDateCategory(
      claim.precision,
      claim.month,
      claim.day,
    );

    out.push({
      gameQid,
      category,
      date: toUtcDate(claim.year, claim.month, claim.day),
      year: claim.year,
      month: claim.month,
      day: claim.day,
      precision: claim.precision,
      human: buildReleaseDateHuman({
        year: claim.year,
        month: claim.month,
        day: claim.day,
        category,
      }),
      source: "wikidata:P577",
      claimId: claim.claimId,
    });
  }

  return out;
}

function parseWebsites(
  gameQid: string,
  claims: WikidataClaims | undefined,
): Prisma.WebsiteCreateManyInput[] {
  const out: Prisma.WebsiteCreateManyInput[] = [];

  for (const claim of extractStringClaims(claims, "P856")) {
    out.push({
      gameQid,
      category: WebsiteCategory.OFFICIAL,
      url: claim.value,
      source: "wikidata:P856",
      claimId: claim.claimId,
    });
  }

  return out;
}

function parseGameImages(
  gameQid: string,
  claims: WikidataClaims | undefined,
): Prisma.GameImageCreateManyInput[] {
  const files = extractImageCommonsFiles(claims);
  if (!files.length) return [];

  const cover = extractImageCommons(claims);

  return files.map((file) => ({
    gameQid,
    kind: cover === file ? GameImageKind.COVER : GameImageKind.OTHER,
    url: commonsFileUrl(file),
    source: "wikidata:P18",
    imageId: file,
  }));
}

function parseAlternativeNames(
  gameQid: string,
  entity: WikidataEntity | undefined,
): Prisma.AlternativeNameCreateManyInput[] {
  if (!entity || entity.missing) return [];

  const names = new Set<string>();

  for (const aliases of Object.values(entity.aliases ?? {})) {
    for (const alias of aliases ?? []) {
      const value = alias?.value?.trim();
      if (!value) continue;
      names.add(value);
    }
  }

  return [...names].map((name) => ({
    gameQid,
    name,
    source: "wikidata:alias",
  }));
}

function parseExternalGames(
  gameQid: string,
  claims: WikidataClaims | undefined,
): Prisma.ExternalGameCreateManyInput[] {
  const out: Prisma.ExternalGameCreateManyInput[] = [];

  for (const claim of extractStringClaims(claims, "P1733")) {
    const uid = claim.value;
    out.push({
      gameQid,
      category: ExternalGameCategory.STEAM,
      uid,
      url: `https://store.steampowered.com/app/${encodeURIComponent(uid)}`,
      source: "wikidata:P1733",
      claimId: claim.claimId,
    });
  }

  for (const claim of extractStringClaims(claims, "P2725")) {
    const uid = claim.value;
    out.push({
      gameQid,
      category: ExternalGameCategory.GOG,
      uid,
      url: `https://www.gog.com/game/${encodeURIComponent(uid)}`,
      source: "wikidata:P2725",
      claimId: claim.claimId,
    });
  }

  return out;
}

function parseVideos(
  gameQid: string,
  claims: WikidataClaims | undefined,
): Prisma.GameVideoCreateManyInput[] {
  return extractStringClaims(claims, "P1651").map((claim) => ({
    gameQid,
    provider: VideoProvider.YOUTUBE,
    videoId: claim.value,
    source: "wikidata:P1651",
  }));
}

function parseScoreRows(
  gameQid: string,
  claims: WikidataClaims | undefined,
): Prisma.GameScoreCreateManyInput[] {
  const scores = extractQuantityClaims(claims, "P444")
    .map((claim) => ({
      gameQid,
      provider: ScoreProvider.WIKIDATA,
      score: claim.amount,
      source: "wikidata:P444",
      claimId: claim.claimId,
    }))
    .sort((a, b) => a.score - b.score);

  if (!scores.length) return [];
  const median = scores[Math.floor((scores.length - 1) / 2)] ?? scores[0];
  return median ? [median] : [];
}

function summarizeExternalScore(claims: WikidataClaims | undefined): {
  aggregatedRating: number | null;
  aggregatedRatingCount: number | null;
} {
  const values = extractQuantityClaims(claims, "P444").map(
    (entry) => entry.amount,
  );
  if (!values.length) {
    return { aggregatedRating: null, aggregatedRatingCount: null };
  }

  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    aggregatedRating: Number(avg.toFixed(2)),
    aggregatedRatingCount: values.length,
  };
}

function extractFirstReleaseAt(
  claims: WikidataClaims | undefined,
): Date | null {
  let earliest: Date | null = null;

  for (const claim of extractReleaseDateClaims(claims)) {
    if (claim.year === null) continue;

    const date = toUtcDate(claim.year, claim.month, claim.day);
    if (!earliest || date < earliest) {
      earliest = date;
    }
  }

  return earliest;
}

function parseCliOptions(argv: string[]): CliOptions {
  return {
    enrichAllGames: argv.includes("--all"),
    minimal: argv.includes("--minimal"),
  };
}

function toClaimsJson(
  value: unknown,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function fetchLabelMap(
  qids: string[],
): Promise<Map<string, EntityLabelInfo>> {
  const map = new Map<string, EntityLabelInfo>();

  for (const ids of chunk(qids, CONFIG.enrichBatchSize)) {
    const response = await wbGetEntitiesLabels(ids);
    for (const qid of ids) {
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

function parseTagLinks(
  gameQid: string,
  claims: WikidataClaims | undefined,
): ParsedTagLink[] {
  const out: ParsedTagLink[] = [];

  for (const spec of TAG_PROPERTY_MAP) {
    const tagIds = extractEntityIds(claims, spec.propertyId);
    for (const tagId of tagIds) {
      out.push({
        gameQid,
        tagId,
        kind: spec.kind,
        source: spec.source,
      });
    }
  }

  return out;
}

function parseCompanyLinks(
  gameQid: string,
  claims: WikidataClaims | undefined,
): ParsedCompanyLink[] {
  const out: ParsedCompanyLink[] = [];

  for (const spec of COMPANY_PROPERTY_MAP) {
    const companyIds = extractEntityIds(claims, spec.propertyId);
    for (const companyQid of companyIds) {
      out.push({
        gameQid,
        companyQid,
        role: spec.role,
      });
    }
  }

  return out;
}

function buildGameUpdate(
  game: CandidateGame,
  entity: WikidataEntity | undefined,
): ParsedGameUpdate {
  if (!entity || entity.missing) {
    return {
      qid: game.qid,
      title: game.title,
      description: null,
      storyline: null,
      imageCommons: null,
      imageUrl: null,
      releaseYear: null,
      firstReleaseAt: null,
      claimsJson: Prisma.JsonNull,
      sitelinks: 0,
      wikiTitleEn: null,
      wikiUrlEn: null,
      aggregatedRating: null,
      aggregatedRatingCount: null,
    };
  }

  const imageCommons = extractImageCommons(entity.claims);
  const sitelinks = Object.keys(entity.sitelinks ?? {}).length;
  const wikiTitleEn = entity.sitelinks?.enwiki?.title?.trim() || null;
  const wikiUrlEn =
    entity.sitelinks?.enwiki?.url?.trim() ||
    (wikiTitleEn
      ? `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiTitleEn)}`
      : null);
  const scoreSummary = summarizeExternalScore(entity.claims);

  return {
    qid: game.qid,
    title: getEnglishLabel(entity) ?? game.title,
    description: getEnglishDescription(entity),
    storyline: getEnglishDescription(entity),
    imageCommons,
    imageUrl: imageCommons ? commonsFileUrl(imageCommons) : null,
    releaseYear: extractReleaseYear(entity.claims),
    firstReleaseAt: extractFirstReleaseAt(entity.claims),
    claimsJson: toClaimsJson(entity.claims ?? null),
    sitelinks,
    wikiTitleEn,
    wikiUrlEn,
    aggregatedRating: scoreSummary.aggregatedRating,
    aggregatedRatingCount: scoreSummary.aggregatedRatingCount,
  };
}

async function enrichBatch(
  games: CandidateGame[],
  writeLimiter: ReturnType<typeof pLimit>,
): Promise<BatchStats> {
  const qids = games.map((game) => game.qid);
  const response = await wbGetEntitiesFull(qids);

  const updates: ParsedGameUpdate[] = [];
  const allTagLinks: ParsedTagLink[] = [];
  const allCompanyLinks: ParsedCompanyLink[] = [];
  const allReleaseDates: Prisma.ReleaseDateCreateManyInput[] = [];
  const allWebsites: Prisma.WebsiteCreateManyInput[] = [];
  const allImages: Prisma.GameImageCreateManyInput[] = [];
  const allAlternativeNames: Prisma.AlternativeNameCreateManyInput[] = [];
  const allExternalGames: Prisma.ExternalGameCreateManyInput[] = [];
  const allVideos: Prisma.GameVideoCreateManyInput[] = [];
  const allScores: Prisma.GameScoreCreateManyInput[] = [];

  for (const game of games) {
    const entity = response.entities[game.qid];
    const claims = entity?.claims;

    updates.push(buildGameUpdate(game, entity));
    allTagLinks.push(...parseTagLinks(game.qid, claims));
    allCompanyLinks.push(...parseCompanyLinks(game.qid, claims));
    allReleaseDates.push(...parseReleaseDates(game.qid, claims));
    allWebsites.push(...parseWebsites(game.qid, claims));
    allImages.push(...parseGameImages(game.qid, claims));
    allAlternativeNames.push(...parseAlternativeNames(game.qid, entity));
    allExternalGames.push(...parseExternalGames(game.qid, claims));
    allVideos.push(...parseVideos(game.qid, claims));
    allScores.push(...parseScoreRows(game.qid, claims));
  }

  const uniqueTagIds = [...new Set(allTagLinks.map((item) => item.tagId))];
  const uniqueCompanyQids = [
    ...new Set(allCompanyLinks.map((item) => item.companyQid)),
  ];

  const [tagLabelMap, companyLabelMap] = await Promise.all([
    fetchLabelMap(uniqueTagIds),
    fetchLabelMap(uniqueCompanyQids),
  ]);

  const tagsById = new Map<string, Prisma.TagCreateManyInput>();
  for (const link of allTagLinks) {
    if (!tagsById.has(link.tagId)) {
      const labelInfo = tagLabelMap.get(link.tagId);
      tagsById.set(link.tagId, {
        id: link.tagId,
        kind: link.kind,
        label: labelInfo?.label ?? link.tagId,
        description: labelInfo?.description ?? null,
        source: link.source,
      });
    }
  }

  const companiesByQid = new Map<string, Prisma.CompanyCreateManyInput>();
  for (const link of allCompanyLinks) {
    if (!companiesByQid.has(link.companyQid)) {
      const labelInfo = companyLabelMap.get(link.companyQid);
      companiesByQid.set(link.companyQid, {
        qid: link.companyQid,
        name: labelInfo?.label ?? link.companyQid,
        description: labelInfo?.description ?? null,
      });
    }
  }

  const gameTagRows = [
    ...new Map(
      allTagLinks.map((link) => [`${link.gameQid}:${link.tagId}`, link]),
    ).values(),
  ]
    .map(
      (link) =>
        ({
          gameQid: link.gameQid,
          tagId: link.tagId,
        }) satisfies Prisma.GameTagCreateManyInput,
    )
    .sort(
      (a, b) =>
        a.tagId.localeCompare(b.tagId) || a.gameQid.localeCompare(b.gameQid),
    );

  const gameCompanyRows = [
    ...new Map(
      allCompanyLinks.map((link) => [
        `${link.gameQid}:${link.companyQid}:${link.role}`,
        link,
      ]),
    ).values(),
  ]
    .map(
      (link) =>
        ({
          gameQid: link.gameQid,
          companyQid: link.companyQid,
          role: link.role,
        }) satisfies Prisma.GameCompanyCreateManyInput,
    )
    .sort(
      (a, b) =>
        a.companyQid.localeCompare(b.companyQid) ||
        a.role.localeCompare(b.role) ||
        a.gameQid.localeCompare(b.gameQid),
    );

  await writeLimiter(() =>
    withDbRetry(
      () =>
        prisma.$transaction(async (tx) => {
          if (tagsById.size) {
            await tx.tag.createMany({
              data: [...tagsById.values()].sort((a, b) =>
                a.id.localeCompare(b.id),
              ),
              skipDuplicates: true,
            });
          }

          if (companiesByQid.size) {
            await tx.company.createMany({
              data: [...companiesByQid.values()].sort((a, b) =>
                a.qid.localeCompare(b.qid),
              ),
              skipDuplicates: true,
            });
          }

          await tx.gameTag.deleteMany({ where: { gameQid: { in: qids } } });
          await tx.gameCompany.deleteMany({ where: { gameQid: { in: qids } } });
          await tx.releaseDate.deleteMany({ where: { gameQid: { in: qids } } });
          await tx.website.deleteMany({ where: { gameQid: { in: qids } } });
          await tx.gameImage.deleteMany({ where: { gameQid: { in: qids } } });
          await tx.alternativeName.deleteMany({
            where: { gameQid: { in: qids } },
          });
          await tx.externalGame.deleteMany({
            where: { gameQid: { in: qids } },
          });
          await tx.gameVideo.deleteMany({ where: { gameQid: { in: qids } } });
          await tx.gameScore.deleteMany({ where: { gameQid: { in: qids } } });

          if (gameTagRows.length) {
            await tx.gameTag.createMany({
              data: gameTagRows,
              skipDuplicates: true,
            });
          }

          if (gameCompanyRows.length) {
            await tx.gameCompany.createMany({
              data: gameCompanyRows,
              skipDuplicates: true,
            });
          }

          if (allReleaseDates.length) {
            await tx.releaseDate.createMany({
              data: allReleaseDates,
              skipDuplicates: true,
            });
          }

          if (allWebsites.length) {
            await tx.website.createMany({
              data: allWebsites,
              skipDuplicates: true,
            });
          }

          if (allImages.length) {
            await tx.gameImage.createMany({
              data: allImages,
              skipDuplicates: true,
            });
          }

          if (allAlternativeNames.length) {
            await tx.alternativeName.createMany({
              data: allAlternativeNames,
              skipDuplicates: true,
            });
          }

          if (allExternalGames.length) {
            await tx.externalGame.createMany({
              data: allExternalGames,
              skipDuplicates: true,
            });
          }

          if (allVideos.length) {
            await tx.gameVideo.createMany({
              data: allVideos,
              skipDuplicates: true,
            });
          }

          if (allScores.length) {
            await tx.gameScore.createMany({
              data: allScores,
              skipDuplicates: true,
            });
          }

          for (const update of updates) {
            await tx.game.update({
              where: { qid: update.qid },
              data: {
                title: update.title,
                description: update.description,
                storyline: update.storyline,
                imageCommons: update.imageCommons,
                imageUrl: update.imageUrl,
                releaseYear: update.releaseYear,
                firstReleaseAt: update.firstReleaseAt,
                claimsJson: update.claimsJson,
                sitelinks: update.sitelinks,
                wikiTitleEn: update.wikiTitleEn,
                wikiUrlEn: update.wikiUrlEn,
                aggregatedRating: update.aggregatedRating,
                aggregatedRatingCount: update.aggregatedRatingCount,
                lastEnrichedAt: new Date(),
              },
            });
          }
        }),
      `batch:${qids[0] ?? "unknown"}:${qids[qids.length - 1] ?? "unknown"}`,
    ),
  );

  return {
    games: updates.length,
    tags: tagsById.size,
    companies: companiesByQid.size,
    gameTags: gameTagRows.length,
    gameCompanies: gameCompanyRows.length,
    releaseDates: allReleaseDates.length,
    websites: allWebsites.length,
    images: allImages.length,
    alternativeNames: allAlternativeNames.length,
    externalGames: allExternalGames.length,
    videos: allVideos.length,
    scores: allScores.length,
  };
}

async function enrichBatchMinimal(
  games: CandidateGame[],
  writeLimiter: ReturnType<typeof pLimit>,
): Promise<BatchStats> {
  const qids = games.map((game) => game.qid);
  const response = await wbGetEntitiesFull(qids);

  const updates: ParsedGameUpdate[] = [];
  for (const game of games) {
    const entity = response.entities[game.qid];
    updates.push(buildGameUpdate(game, entity));
  }

  await writeLimiter(() =>
    withDbRetry(
      () =>
        prisma.$transaction(async (tx) => {
          for (const update of updates) {
            await tx.game.update({
              where: { qid: update.qid },
              data: {
                title: update.title,
                description: update.description,
                storyline: update.storyline,
                imageCommons: update.imageCommons,
                imageUrl: update.imageUrl,
                releaseYear: update.releaseYear,
                firstReleaseAt: update.firstReleaseAt,
                claimsJson: update.claimsJson,
                sitelinks: update.sitelinks,
                wikiTitleEn: update.wikiTitleEn,
                wikiUrlEn: update.wikiUrlEn,
                aggregatedRating: update.aggregatedRating,
                aggregatedRatingCount: update.aggregatedRatingCount,
                lastEnrichedAt: new Date(),
              },
            });
          }
        }),
      `minimal-batch:${qids[0] ?? "unknown"}:${qids[qids.length - 1] ?? "unknown"}`,
    ),
  );

  return {
    games: updates.length,
    tags: 0,
    companies: 0,
    gameTags: 0,
    gameCompanies: 0,
    releaseDates: 0,
    websites: 0,
    images: 0,
    alternativeNames: 0,
    externalGames: 0,
    videos: 0,
    scores: 0,
  };
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const concurrency = Math.max(1, CONFIG.enrichConcurrency);
  const limit = pLimit(concurrency);
  const writeLimiter = pLimit(1);

  let cursorQid: string | null = null;
  let processedGames = 0;
  let totalTags = 0;
  let totalCompanies = 0;
  let totalGameTags = 0;
  let totalGameCompanies = 0;
  let totalReleaseDates = 0;
  let totalWebsites = 0;
  let totalImages = 0;
  let totalAlternativeNames = 0;
  let totalExternalGames = 0;
  let totalVideos = 0;
  let totalScores = 0;

  for (;;) {
    const remaining =
      CONFIG.enrichMaxGames !== null
        ? Math.max(CONFIG.enrichMaxGames - processedGames, 0)
        : null;
    if (remaining !== null && remaining <= 0) break;

    const querySize = Math.max(1, CONFIG.enrichBatchSize * concurrency);
    const take =
      remaining === null ? querySize : Math.min(querySize, remaining);

    const where: Prisma.GameWhereInput = cursorQid
      ? { qid: { gt: cursorQid } }
      : {};

    if (!options.enrichAllGames) {
      where.lastEnrichedAt = null;
    }

    const games = await prisma.game.findMany({
      where,
      orderBy: { qid: "asc" },
      take,
      select: { qid: true, title: true },
    });

    if (!games.length) break;

    const batches = chunk(games, CONFIG.enrichBatchSize);
    const stats = await Promise.all(
      batches.map((batch) =>
        limit(() =>
          options.minimal
            ? enrichBatchMinimal(batch, writeLimiter)
            : enrichBatch(batch, writeLimiter),
        ),
      ),
    );

    for (const item of stats) {
      processedGames += item.games;
      totalTags += item.tags;
      totalCompanies += item.companies;
      totalGameTags += item.gameTags;
      totalGameCompanies += item.gameCompanies;
      totalReleaseDates += item.releaseDates;
      totalWebsites += item.websites;
      totalImages += item.images;
      totalAlternativeNames += item.alternativeNames;
      totalExternalGames += item.externalGames;
      totalVideos += item.videos;
      totalScores += item.scores;
    }

    cursorQid = games[games.length - 1]?.qid ?? cursorQid;

    console.log(
      `enrichGames: processed=${processedGames} cursor=${cursorQid} tags=${totalTags} companies=${totalCompanies}`,
    );
  }

  console.log(
    `enrichGames: done games=${processedGames} tags=${totalTags} companies=${totalCompanies} gameTags=${totalGameTags} gameCompanies=${totalGameCompanies} releaseDates=${totalReleaseDates} websites=${totalWebsites} images=${totalImages} altNames=${totalAlternativeNames} externalGames=${totalExternalGames} videos=${totalVideos} scores=${totalScores}`,
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
