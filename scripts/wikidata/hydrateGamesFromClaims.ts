import {
  GameImageKind,
  Prisma,
  ReleaseDateCategory,
  StatementRank,
  WebsiteCategory,
} from "@prisma/client";
import { commonsFileUrl } from "./lib/wikidataApi";
import { prisma } from "./lib/prisma";
import {
  getHydratableRegistryEntries,
  type PropertyRegistryEntry,
} from "./propertyRegistry";

type JsonObject = Record<string, unknown>;

interface CliOptions {
  batchSize: number;
  maxGames: number | null;
  includeNiche: boolean;
}

interface CandidateGame {
  qid: string;
  title: string;
  claimsJson: Prisma.JsonValue;
  releaseYear: number | null;
  firstReleaseAt: Date | null;
  imageCommons: string | null;
  imageUrl: string | null;
}

interface RankedValue<T> {
  value: T;
  rankScore: number;
}

interface TimeValue {
  claimId: string | null;
  rankScore: number;
  rank: StatementRank | null;
  time: string;
  precision: number | null;
  year: number;
  month: number | null;
  day: number | null;
  platformQid: string | null;
  regionQid: string | null;
  claimJson: Prisma.InputJsonValue | null;
}

interface BatchRows {
  scalarUpdates: Array<{ qid: string; data: Prisma.GameUpdateInput }>;
  tagsToCreate: Map<string, Prisma.TagCreateManyInput>;
  companiesToCreate: Map<string, Prisma.CompanyCreateManyInput>;
  gamePlatformRows: Prisma.GamePlatformCreateManyInput[];
  gameTagRows: Prisma.GameTagCreateManyInput[];
  gameCompanyRows: Prisma.GameCompanyCreateManyInput[];
  gameRelationRows: Prisma.GameRelationCreateManyInput[];
  releaseDateRows: Prisma.ReleaseDateCreateManyInput[];
  websiteRows: Prisma.WebsiteCreateManyInput[];
  externalGameRows: Prisma.ExternalGameCreateManyInput[];
  imageRows: Prisma.GameImageCreateManyInput[];
  videoRows: Prisma.GameVideoCreateManyInput[];
  ageRatingRows: Prisma.GameAgeRatingCreateManyInput[];
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

function parseCliOptions(argv: string[]): CliOptions {
  const batchArg = argv.find((value) => value.startsWith("--batch-size="));
  const maxGamesArg = argv.find((value) => value.startsWith("--max-games="));

  return {
    batchSize: parsePositiveInt(batchArg?.slice("--batch-size=".length), 500),
    maxGames: parseOptionalPositiveInt(
      maxGamesArg?.slice("--max-games=".length),
    ),
    includeNiche: !argv.includes("--no-niche"),
  };
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null;
}

function asClaimsObject(value: Prisma.JsonValue): JsonObject | null {
  return isObject(value) ? value : null;
}

function getPropertyStatements(
  claims: JsonObject | null,
  propertyId: string,
): unknown[] {
  if (!claims) return [];
  const value = claims[propertyId];
  return Array.isArray(value) ? value : [];
}

function getRankScore(rank: unknown): number {
  if (rank === "preferred") return 2;
  if (rank === "normal") return 1;
  return 0;
}

function toStatementRank(rank: unknown): StatementRank | null {
  if (rank === "preferred") return StatementRank.PREFERRED;
  if (rank === "normal") return StatementRank.NORMAL;
  if (rank === "deprecated") return StatementRank.DEPRECATED;
  return null;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function getClaimId(statement: unknown): string | null {
  if (!isObject(statement)) return null;
  return normalizeString(statement.id);
}

function getMainSnakDataValue(statement: unknown): unknown | null {
  if (!isObject(statement)) return null;
  const mainsnak = statement.mainsnak;
  if (!isObject(mainsnak)) return null;
  if (mainsnak.snaktype !== "value") return null;
  const datavalue = mainsnak.datavalue;
  if (!isObject(datavalue)) return null;
  return datavalue.value ?? null;
}

function compareRanked<T>(left: RankedValue<T>, right: RankedValue<T>): number {
  return right.rankScore - left.rankScore;
}

function pickBestValue<T>(values: RankedValue<T>[]): RankedValue<T> | null {
  if (!values.length) return null;
  const sorted = [...values].sort(compareRanked);
  return sorted[0] ?? null;
}

function extractItemIds(statements: unknown[]): RankedValue<string>[] {
  const out: RankedValue<string>[] = [];
  const seen = new Set<string>();

  for (const statement of statements) {
    const value = getMainSnakDataValue(statement);
    if (!isObject(value)) continue;

    const id = normalizeString(value.id);
    if (!id || !id.startsWith("Q")) continue;
    if (seen.has(id)) continue;

    seen.add(id);
    const rankScore = isObject(statement) ? getRankScore(statement.rank) : 0;
    out.push({ value: id, rankScore });
  }

  return out;
}

function extractStringValues(statements: unknown[]): RankedValue<string>[] {
  const out: RankedValue<string>[] = [];
  const seen = new Set<string>();

  for (const statement of statements) {
    const value = normalizeString(getMainSnakDataValue(statement));
    if (!value) continue;

    const dedupeKey = value.toLowerCase();
    if (seen.has(dedupeKey)) continue;

    seen.add(dedupeKey);
    const rankScore = isObject(statement) ? getRankScore(statement.rank) : 0;
    out.push({ value, rankScore });
  }

  return out;
}

function parseWikidataDateParts(timeValue: string): {
  year: number | null;
  month: number | null;
  day: number | null;
} {
  const match = timeValue.match(/^([+-]?\d{1,6})-(\d{2})-(\d{2})T/);
  if (!match) {
    const yearOnly = Number.parseInt(timeValue.slice(0, 6), 10);
    return {
      year: Number.isFinite(yearOnly) && yearOnly > 0 ? yearOnly : null,
      month: null,
      day: null,
    };
  }

  const yearRaw = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isFinite(yearRaw) || yearRaw <= 0) {
    return { year: null, month: null, day: null };
  }

  const monthRaw = Number.parseInt(match[2] ?? "", 10);
  const dayRaw = Number.parseInt(match[3] ?? "", 10);

  const month = monthRaw >= 1 && monthRaw <= 12 ? monthRaw : null;
  const day = dayRaw >= 1 && dayRaw <= 31 ? dayRaw : null;

  return {
    year: yearRaw,
    month,
    day,
  };
}

function extractTimeValues(statements: unknown[]): TimeValue[] {
  const out: TimeValue[] = [];

  for (const statement of statements) {
    const dataValue = getMainSnakDataValue(statement);
    if (!isObject(dataValue)) continue;

    const time = normalizeString(dataValue.time);
    if (!time) continue;

    const precisionRaw = dataValue.precision;
    const precision =
      typeof precisionRaw === "number" && Number.isFinite(precisionRaw)
        ? precisionRaw
        : null;

    const parts = parseWikidataDateParts(time);
    if (parts.year === null) continue;

    const platformQid = extractQualifierItemId(statement, ["P400"]);
    const regionQid = extractQualifierItemId(statement, ["P291", "P3005"]);

    out.push({
      claimId: getClaimId(statement),
      rankScore: isObject(statement) ? getRankScore(statement.rank) : 0,
      rank: isObject(statement) ? toStatementRank(statement.rank) : null,
      time,
      precision,
      year: parts.year,
      month: parts.month,
      day: parts.day,
      platformQid,
      regionQid,
      claimJson: isObject(statement)
        ? (statement as Prisma.InputJsonValue)
        : null,
    });
  }

  return out;
}

function extractQualifierItemId(
  statement: unknown,
  qualifierPropertyIds: string[],
): string | null {
  if (!isObject(statement)) return null;
  const qualifiersRaw = statement.qualifiers;
  if (!isObject(qualifiersRaw)) return null;

  for (const propertyId of qualifierPropertyIds) {
    const qualifierValues = qualifiersRaw[propertyId];
    if (!Array.isArray(qualifierValues)) continue;

    for (const qualifier of qualifierValues) {
      const value = getMainSnakDataValue(qualifier);
      if (!isObject(value)) continue;
      const id = normalizeString(value.id);
      if (id && id.startsWith("Q")) return id;
    }
  }

  return null;
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

function toUtcDate(
  year: number,
  month: number | null,
  day: number | null,
): Date {
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1, 0, 0, 0));
}

function buildReleaseDateHuman(value: {
  year: number;
  month: number | null;
  day: number | null;
  category: ReleaseDateCategory;
}): string {
  const pad = (n: number) => n.toString().padStart(2, "0");

  if (
    value.category === ReleaseDateCategory.YYYYMMMMDD &&
    value.month !== null &&
    value.day !== null
  ) {
    return `${value.year}-${pad(value.month)}-${pad(value.day)}`;
  }

  if (value.category === ReleaseDateCategory.YYYYMMMM && value.month !== null) {
    return `${value.year}-${pad(value.month)}`;
  }

  return `${value.year}`;
}

function shouldApplyScalarUpdate(
  existingValue: string | number | Date | null,
  nextValue: string | number | Date,
  rankScore: number,
): boolean {
  if (existingValue === null) return true;

  if (existingValue instanceof Date && nextValue instanceof Date) {
    return rankScore >= 2 && existingValue.getTime() !== nextValue.getTime();
  }

  return rankScore >= 2 && existingValue !== nextValue;
}

function dedupeRows<T>(rows: T[], keyFor: (value: T) => string): T[] {
  return [...new Map(rows.map((row) => [keyFor(row), row])).values()];
}

function parseBatch(
  games: CandidateGame[],
  entries: PropertyRegistryEntry[],
): BatchRows {
  const byTarget = {
    gamePlatform: entries.filter((entry) => entry.target === "gamePlatform"),
    gameTag: entries.filter((entry) => entry.target === "gameTag"),
    gameCompany: entries.filter((entry) => entry.target === "gameCompany"),
    gameRelation: entries.filter((entry) => entry.target === "gameRelation"),
    gameReleaseDate: entries.filter(
      (entry) => entry.target === "game.releaseDate",
    ),
    gameImage: entries.filter((entry) => entry.target === "game.image"),
    website: entries.filter((entry) => entry.target === "website"),
    externalGame: entries.filter((entry) => entry.target === "externalGame"),
    gameVideo: entries.filter((entry) => entry.target === "gameVideo"),
    gameAgeRating: entries.filter((entry) => entry.target === "gameAgeRating"),
  };

  const scalarUpdates: Array<{ qid: string; data: Prisma.GameUpdateInput }> =
    [];
  const tagsToCreate = new Map<string, Prisma.TagCreateManyInput>();
  const companiesToCreate = new Map<string, Prisma.CompanyCreateManyInput>();
  const gamePlatformRows: Prisma.GamePlatformCreateManyInput[] = [];
  const gameTagRows: Prisma.GameTagCreateManyInput[] = [];
  const gameCompanyRows: Prisma.GameCompanyCreateManyInput[] = [];
  const gameRelationRows: Prisma.GameRelationCreateManyInput[] = [];
  const releaseDateRows: Prisma.ReleaseDateCreateManyInput[] = [];
  const websiteRows: Prisma.WebsiteCreateManyInput[] = [];
  const externalGameRows: Prisma.ExternalGameCreateManyInput[] = [];
  const imageRows: Prisma.GameImageCreateManyInput[] = [];
  const videoRows: Prisma.GameVideoCreateManyInput[] = [];
  const ageRatingRows: Prisma.GameAgeRatingCreateManyInput[] = [];

  for (const game of games) {
    const claims = asClaimsObject(game.claimsJson);
    if (!claims) continue;

    const scalarPatch: Prisma.GameUpdateInput = {};

    for (const entry of byTarget.gamePlatform) {
      const itemIds = extractItemIds(
        getPropertyStatements(claims, entry.propertyId),
      );
      for (const item of itemIds) {
        gamePlatformRows.push({
          gameQid: game.qid,
          platformQid: item.value,
          source: entry.source,
        });
      }
    }

    for (const entry of byTarget.gameTag) {
      if (!entry.tagKind) continue;
      const itemIds = extractItemIds(
        getPropertyStatements(claims, entry.propertyId),
      );
      for (const item of itemIds) {
        tagsToCreate.set(item.value, {
          id: item.value,
          kind: entry.tagKind,
          label: item.value,
          source: entry.source,
          description: null,
        });

        gameTagRows.push({
          gameQid: game.qid,
          tagId: item.value,
        });
      }
    }

    for (const entry of byTarget.gameCompany) {
      if (!entry.companyRole) continue;
      const itemIds = extractItemIds(
        getPropertyStatements(claims, entry.propertyId),
      );
      for (const item of itemIds) {
        companiesToCreate.set(item.value, {
          qid: item.value,
          name: item.value,
          description: null,
        });

        gameCompanyRows.push({
          gameQid: game.qid,
          companyQid: item.value,
          role: entry.companyRole,
        });
      }
    }

    for (const entry of byTarget.gameRelation) {
      if (!entry.relationKind) continue;

      const itemIds = extractItemIds(
        getPropertyStatements(claims, entry.propertyId),
      );

      for (const item of itemIds) {
        gameRelationRows.push({
          fromGameQid: game.qid,
          toGameQid: item.value,
          kind: entry.relationKind,
          source: entry.source,
        });
      }
    }

    for (const entry of byTarget.gameReleaseDate) {
      const times = extractTimeValues(
        getPropertyStatements(claims, entry.propertyId),
      );

      const bestRelease = pickBestValue(
        times.map((value) => ({
          value,
          rankScore: value.rankScore,
        })),
      );

      if (bestRelease) {
        const nextYear = bestRelease.value.year;
        const nextFirstReleaseAt = toUtcDate(
          bestRelease.value.year,
          bestRelease.value.month,
          bestRelease.value.day,
        );

        if (
          shouldApplyScalarUpdate(
            game.releaseYear,
            nextYear,
            bestRelease.rankScore,
          )
        ) {
          scalarPatch.releaseYear = nextYear;
        }

        if (
          shouldApplyScalarUpdate(
            game.firstReleaseAt,
            nextFirstReleaseAt,
            bestRelease.rankScore,
          )
        ) {
          scalarPatch.firstReleaseAt = nextFirstReleaseAt;
        }
      }

      for (const timeValue of times) {
        const category = toReleaseDateCategory(
          timeValue.precision,
          timeValue.month,
          timeValue.day,
        );

        releaseDateRows.push({
          gameQid: game.qid,
          category,
          date: toUtcDate(timeValue.year, timeValue.month, timeValue.day),
          year: timeValue.year,
          month: timeValue.month,
          day: timeValue.day,
          precision: timeValue.precision,
          rank: timeValue.rank,
          platformQid: timeValue.platformQid,
          regionQid: timeValue.regionQid,
          calendarModel: "wikidata:gregorian",
          human: buildReleaseDateHuman({
            year: timeValue.year,
            month: timeValue.month,
            day: timeValue.day,
            category,
          }),
          source: entry.source,
          claimId: timeValue.claimId,
          claimJson:
            timeValue.claimJson === null
              ? Prisma.JsonNull
              : timeValue.claimJson,
        });
      }
    }

    for (const entry of byTarget.website) {
      const websiteCategory = entry.websiteCategory ?? WebsiteCategory.OTHER;
      const strings = extractStringValues(
        getPropertyStatements(claims, entry.propertyId),
      );
      for (const item of strings) {
        websiteRows.push({
          gameQid: game.qid,
          category: websiteCategory,
          url: item.value,
          source: entry.source,
        });
      }
    }

    for (const entry of byTarget.externalGame) {
      if (!entry.externalCategory) continue;
      const ids = extractStringValues(
        getPropertyStatements(claims, entry.propertyId),
      );
      for (const item of ids) {
        const url =
          entry.propertyId === "P1733"
            ? `https://store.steampowered.com/app/${encodeURIComponent(item.value)}`
            : entry.propertyId === "P2725"
              ? `https://www.gog.com/game/${encodeURIComponent(item.value)}`
              : null;

        externalGameRows.push({
          gameQid: game.qid,
          category: entry.externalCategory,
          uid: item.value,
          url,
          source: entry.source,
        });
      }
    }

    for (const entry of byTarget.gameImage) {
      const imageValues = extractStringValues(
        getPropertyStatements(claims, entry.propertyId),
      );
      const bestImage = pickBestValue(imageValues);

      if (bestImage) {
        if (
          shouldApplyScalarUpdate(
            game.imageCommons,
            bestImage.value,
            bestImage.rankScore,
          )
        ) {
          scalarPatch.imageCommons = bestImage.value;
          scalarPatch.imageUrl = commonsFileUrl(bestImage.value);
        }
      }

      for (const imageValue of imageValues) {
        const kind =
          bestImage && imageValue.value === bestImage.value
            ? GameImageKind.COVER
            : GameImageKind.OTHER;

        imageRows.push({
          gameQid: game.qid,
          kind,
          url: commonsFileUrl(imageValue.value),
          source: entry.source,
          imageId: imageValue.value,
        });
      }
    }

    for (const entry of byTarget.gameVideo) {
      if (!entry.videoProvider) continue;
      const values = extractStringValues(
        getPropertyStatements(claims, entry.propertyId),
      );

      for (const item of values) {
        videoRows.push({
          gameQid: game.qid,
          provider: entry.videoProvider,
          videoId: item.value,
          source: entry.source,
        });
      }
    }

    for (const entry of byTarget.gameAgeRating) {
      if (!entry.ageRatingOrganization) continue;

      const strings = extractStringValues(
        getPropertyStatements(claims, entry.propertyId),
      );
      const items = extractItemIds(
        getPropertyStatements(claims, entry.propertyId),
      );

      for (const value of strings.map((item) => item.value)) {
        ageRatingRows.push({
          gameQid: game.qid,
          organization: entry.ageRatingOrganization,
          rating: value,
          source: entry.source,
        });
      }

      for (const value of items.map((item) => item.value)) {
        ageRatingRows.push({
          gameQid: game.qid,
          organization: entry.ageRatingOrganization,
          rating: value,
          source: entry.source,
        });
      }
    }

    if (Object.keys(scalarPatch).length > 0) {
      scalarUpdates.push({
        qid: game.qid,
        data: scalarPatch,
      });
    }
  }

  return {
    scalarUpdates,
    tagsToCreate,
    companiesToCreate,
    gamePlatformRows: dedupeRows(
      gamePlatformRows,
      (row) => `${row.gameQid}:${row.platformQid}`,
    ),
    gameTagRows: dedupeRows(
      gameTagRows,
      (row) => `${row.gameQid}:${row.tagId}`,
    ),
    gameCompanyRows: dedupeRows(
      gameCompanyRows,
      (row) => `${row.gameQid}:${row.companyQid}:${row.role}`,
    ),
    gameRelationRows: dedupeRows(
      gameRelationRows,
      (row) => `${row.fromGameQid}:${row.toGameQid}:${row.kind}`,
    ),
    releaseDateRows: dedupeRows(
      releaseDateRows,
      (row) => `${row.gameQid}:${row.claimId ?? row.human ?? ""}`,
    ),
    websiteRows: dedupeRows(websiteRows, (row) => `${row.gameQid}:${row.url}`),
    externalGameRows: dedupeRows(
      externalGameRows,
      (row) => `${row.gameQid}:${row.category}:${row.uid ?? ""}`,
    ),
    imageRows: dedupeRows(
      imageRows,
      (row) => `${row.gameQid}:${row.kind}:${row.url}`,
    ),
    videoRows: dedupeRows(
      videoRows,
      (row) => `${row.gameQid}:${row.provider}:${row.videoId}`,
    ),
    ageRatingRows: dedupeRows(
      ageRatingRows,
      (row) => `${row.gameQid}:${row.organization}:${row.rating}`,
    ),
  };
}

async function applyBatch(
  games: CandidateGame[],
  parsed: BatchRows,
): Promise<{ skippedGameRelationRows: number }> {
  const qids = games.map((game) => game.qid);
  const allPlatformQids = [
    ...new Set(parsed.gamePlatformRows.map((row) => row.platformQid)),
  ];
  const allRelationTargetQids = [
    ...new Set(parsed.gameRelationRows.map((row) => row.toGameQid)),
  ];
  const existingPlatforms = new Set(
    (
      await prisma.platform.findMany({
        where: { qid: { in: allPlatformQids } },
        select: { qid: true },
      })
    ).map((row) => row.qid),
  );
  const existingRelationTargets = new Set(
    (
      await prisma.game.findMany({
        where: { qid: { in: allRelationTargetQids } },
        select: { qid: true },
      })
    ).map((row) => row.qid),
  );

  const filteredGamePlatformRows = parsed.gamePlatformRows.filter((row) =>
    existingPlatforms.has(row.platformQid),
  );
  const filteredGameRelationRows = parsed.gameRelationRows.filter((row) =>
    existingRelationTargets.has(row.toGameQid),
  );
  const skippedGameRelationRows =
    parsed.gameRelationRows.length - filteredGameRelationRows.length;

  await prisma.$transaction(async (tx) => {
    if (parsed.tagsToCreate.size) {
      await tx.tag.createMany({
        data: [...parsed.tagsToCreate.values()],
        skipDuplicates: true,
      });
    }

    if (parsed.companiesToCreate.size) {
      await tx.company.createMany({
        data: [...parsed.companiesToCreate.values()],
        skipDuplicates: true,
      });
    }

    await tx.gamePlatform.deleteMany({ where: { gameQid: { in: qids } } });
    await tx.gameTag.deleteMany({ where: { gameQid: { in: qids } } });
    await tx.gameCompany.deleteMany({ where: { gameQid: { in: qids } } });
    await tx.gameRelation.deleteMany({ where: { fromGameQid: { in: qids } } });
    await tx.releaseDate.deleteMany({ where: { gameQid: { in: qids } } });
    await tx.website.deleteMany({ where: { gameQid: { in: qids } } });
    await tx.externalGame.deleteMany({ where: { gameQid: { in: qids } } });
    await tx.gameImage.deleteMany({ where: { gameQid: { in: qids } } });
    await tx.gameVideo.deleteMany({ where: { gameQid: { in: qids } } });
    await tx.gameAgeRating.deleteMany({ where: { gameQid: { in: qids } } });

    if (filteredGamePlatformRows.length) {
      await tx.gamePlatform.createMany({
        data: filteredGamePlatformRows,
        skipDuplicates: true,
      });
    }

    if (parsed.gameTagRows.length) {
      await tx.gameTag.createMany({
        data: parsed.gameTagRows,
        skipDuplicates: true,
      });
    }

    if (parsed.gameCompanyRows.length) {
      await tx.gameCompany.createMany({
        data: parsed.gameCompanyRows,
        skipDuplicates: true,
      });
    }

    if (filteredGameRelationRows.length) {
      await tx.gameRelation.createMany({
        data: filteredGameRelationRows,
        skipDuplicates: true,
      });
    }

    if (parsed.releaseDateRows.length) {
      await tx.releaseDate.createMany({
        data: parsed.releaseDateRows,
        skipDuplicates: true,
      });
    }

    if (parsed.websiteRows.length) {
      await tx.website.createMany({
        data: parsed.websiteRows,
        skipDuplicates: true,
      });
    }

    if (parsed.externalGameRows.length) {
      await tx.externalGame.createMany({
        data: parsed.externalGameRows,
        skipDuplicates: true,
      });
    }

    if (parsed.imageRows.length) {
      await tx.gameImage.createMany({
        data: parsed.imageRows,
        skipDuplicates: true,
      });
    }

    if (parsed.videoRows.length) {
      await tx.gameVideo.createMany({
        data: parsed.videoRows,
        skipDuplicates: true,
      });
    }

    if (parsed.ageRatingRows.length) {
      await tx.gameAgeRating.createMany({
        data: parsed.ageRatingRows,
        skipDuplicates: true,
      });
    }

    for (const update of parsed.scalarUpdates) {
      await tx.game.update({
        where: { qid: update.qid },
        data: {
          ...update.data,
          lastEnrichedAt: new Date(),
        },
      });
    }
  });

  return { skippedGameRelationRows };
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const entries = getHydratableRegistryEntries(options.includeNiche);

  let cursorQid: string | null = null;
  let processed = 0;
  let batchIndex = 0;
  let errors = 0;

  console.log(
    `hydrateGamesFromClaims: start batchSize=${options.batchSize} includeNiche=${options.includeNiche}`,
  );

  for (;;) {
    const remaining =
      options.maxGames !== null
        ? Math.max(options.maxGames - processed, 0)
        : null;

    if (remaining !== null && remaining <= 0) break;

    const games: CandidateGame[] = await prisma.game.findMany({
      where: cursorQid
        ? {
            qid: { gt: cursorQid },
            claimsJson: { not: Prisma.JsonNull },
          }
        : { claimsJson: { not: Prisma.JsonNull } },
      orderBy: { qid: "asc" },
      take:
        remaining === null
          ? options.batchSize
          : Math.min(options.batchSize, remaining),
      select: {
        qid: true,
        title: true,
        claimsJson: true,
        releaseYear: true,
        firstReleaseAt: true,
        imageCommons: true,
        imageUrl: true,
      },
    });

    if (!games.length) break;

    batchIndex += 1;

    try {
      const parsed = parseBatch(games, entries);
      const batchResult = await applyBatch(games, parsed);

      processed += games.length;
      cursorQid = games[games.length - 1]?.qid ?? cursorQid;

      console.log(
        `hydrateGamesFromClaims: batch=${batchIndex} processed=${processed} cursor=${cursorQid} scalarUpdates=${parsed.scalarUpdates.length} gameTags=${parsed.gameTagRows.length} companies=${parsed.gameCompanyRows.length} relationRowsSkipped=${batchResult.skippedGameRelationRows}`,
      );
    } catch (error) {
      errors += 1;
      cursorQid = games[games.length - 1]?.qid ?? cursorQid;
      console.error(
        `hydrateGamesFromClaims: batch=${batchIndex} failed cursor=${cursorQid}`,
      );
      console.error(error);
    }
  }

  console.log(
    `hydrateGamesFromClaims: done processed=${processed} batches=${batchIndex} errors=${errors}`,
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
