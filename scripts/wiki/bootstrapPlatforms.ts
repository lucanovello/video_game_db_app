import { prisma } from "../wikidata/lib/prisma";

type PlatformSeed = {
  qid: string;
  nameLabel: string;
  rosterPageTitle: string;
  notes?: string;
};

const SOURCE_TYPE = "WIKIPEDIA_LIST";
const SOURCE_SITE = "wikipedia:en";

const PLATFORM_SEEDS: PlatformSeed[] = [
  {
    qid: "Q183259",
    nameLabel: "Super Nintendo Entertainment System",
    rosterPageTitle: "List of Super Nintendo Entertainment System games",
  },
  {
    qid: "Q172742",
    nameLabel: "Nintendo Entertainment System",
    rosterPageTitle: "List of Nintendo Entertainment System games",
  },
  {
    qid: "Q184839",
    nameLabel: "Nintendo 64",
    rosterPageTitle: "List of Nintendo 64 games",
  },
  {
    qid: "Q10677",
    nameLabel: "PlayStation",
    rosterPageTitle: "List of PlayStation games (A–L)",
    notes:
      "PlayStation list is split across multiple pages; this is a starter source.",
  },
  {
    qid: "Q10680",
    nameLabel: "PlayStation 2",
    rosterPageTitle: "List of PlayStation 2 games",
  },
  {
    qid: "Q132020",
    nameLabel: "Xbox",
    rosterPageTitle: "List of Xbox games",
  },
  {
    qid: "Q48263",
    nameLabel: "Xbox 360",
    rosterPageTitle: "List of Xbox 360 games",
  },
  {
    qid: "Q182172",
    nameLabel: "GameCube",
    rosterPageTitle: "List of GameCube games",
  },
];

function toWikipediaUrl(title: string): string {
  const slug = title.replace(/\s+/g, "_");
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(slug)}`;
}

function normalizeQid(input: string): string {
  return input.trim().toUpperCase();
}

function validateSeeds(seeds: PlatformSeed[]): PlatformSeed[] {
  const deduped = new Map<string, PlatformSeed>();

  for (const seed of seeds) {
    const qid = normalizeQid(seed.qid);
    if (!/^Q\d+$/.test(qid)) {
      throw new Error(`Invalid platform QID in seed list: ${seed.qid}`);
    }

    const nameLabel = seed.nameLabel.trim();
    const rosterPageTitle = seed.rosterPageTitle.trim();
    if (!nameLabel || !rosterPageTitle) {
      throw new Error(
        `Invalid seed for ${qid}: nameLabel and rosterPageTitle are required`,
      );
    }

    deduped.set(qid, {
      qid,
      nameLabel,
      rosterPageTitle,
      notes: seed.notes?.trim() || undefined,
    });
  }

  return [...deduped.values()].sort((a, b) => a.qid.localeCompare(b.qid));
}

async function main() {
  const startedAt = Date.now();
  const seeds = validateSeeds(PLATFORM_SEEDS);

  let registryCreated = 0;
  let registryUpdated = 0;
  let sourceCreated = 0;
  let sourceUpdated = 0;
  let sourceMigrated = 0;
  let membershipsMigrated = 0;

  for (const seed of seeds) {
    const existingRegistry = await prisma.platformRegistry.findUnique({
      where: { platformQid: seed.qid },
      select: { nameLabel: true, status: true, notes: true },
    });

    await prisma.platformRegistry.upsert({
      where: { platformQid: seed.qid },
      update: {
        nameLabel: seed.nameLabel,
        status: "ACTIVE",
        notes: seed.notes,
      },
      create: {
        platformQid: seed.qid,
        nameLabel: seed.nameLabel,
        status: "ACTIVE",
        notes: seed.notes,
      },
    });

    if (!existingRegistry) registryCreated += 1;
    else if (
      existingRegistry.nameLabel !== seed.nameLabel ||
      existingRegistry.status !== "ACTIVE" ||
      (existingRegistry.notes ?? null) !== (seed.notes ?? null)
    ) {
      registryUpdated += 1;
    }

    const pageUrl = toWikipediaUrl(seed.rosterPageTitle);
    const staleSources = await prisma.platformRosterSource.findMany({
      where: {
        sourceType: SOURCE_TYPE,
        pageTitle: seed.rosterPageTitle,
        platformQid: { not: seed.qid },
      },
      select: {
        id: true,
        platformQid: true,
      },
    });

    if (staleSources.length) {
      const sourcePages = await prisma.wikiPageCache.findMany({
        where: {
          site: SOURCE_SITE,
          OR: [
            { title: seed.rosterPageTitle },
            { title: seed.rosterPageTitle.replaceAll("_", " ") },
          ],
        },
        select: { id: true },
      });
      const sourcePageIds = sourcePages.map((row) => row.id);

      const stalePlatformQids = staleSources.map((row) => row.platformQid);
      const staleMemberships = await prisma.platformGameMembership.findMany({
        where: sourcePageIds.length
          ? {
              platformQid: { in: stalePlatformQids },
              sourcePageId: { in: sourcePageIds },
            }
          : {
              platformQid: { in: stalePlatformQids },
              sourcePage: { site: SOURCE_SITE },
            },
        select: {
          gameQid: true,
          sourcePageId: true,
          regionHint: true,
          dateHint: true,
        },
      });

      if (staleMemberships.length) {
        const created = await prisma.platformGameMembership.createMany({
          data: staleMemberships.map((row) => ({
            platformQid: seed.qid,
            gameQid: row.gameQid,
            sourcePageId: row.sourcePageId,
            regionHint: row.regionHint,
            dateHint: row.dateHint,
          })),
          skipDuplicates: true,
        });
        membershipsMigrated += created.count;

        await prisma.platformGameMembership.deleteMany({
          where: sourcePageIds.length
            ? {
                platformQid: { in: stalePlatformQids },
                sourcePageId: { in: sourcePageIds },
              }
            : {
                platformQid: { in: stalePlatformQids },
                sourcePage: { site: SOURCE_SITE },
              },
        });
      }

      await prisma.platformRosterSource.updateMany({
        where: {
          id: { in: staleSources.map((row) => row.id) },
        },
        data: {
          isActive: false,
          notes: `superseded_by:${seed.qid}`,
        },
      });

      for (const stale of staleSources) {
        const activeSourceCount = await prisma.platformRosterSource.count({
          where: {
            platformQid: stale.platformQid,
            isActive: true,
          },
        });

        if (activeSourceCount === 0) {
          await prisma.platformRegistry.update({
            where: { platformQid: stale.platformQid },
            data: {
              status: "INACTIVE",
              notes: `superseded_by:${seed.qid}`,
            },
          });
        }
      }
      sourceMigrated += staleSources.length;
    }

    const existingSource = await prisma.platformRosterSource.findUnique({
      where: {
        platformQid_sourceType_pageTitle: {
          platformQid: seed.qid,
          sourceType: SOURCE_TYPE,
          pageTitle: seed.rosterPageTitle,
        },
      },
      select: { pageUrl: true, notes: true, isActive: true },
    });

    await prisma.platformRosterSource.upsert({
      where: {
        platformQid_sourceType_pageTitle: {
          platformQid: seed.qid,
          sourceType: SOURCE_TYPE,
          pageTitle: seed.rosterPageTitle,
        },
      },
      update: {
        pageUrl,
        notes: seed.notes,
        isActive: true,
      },
      create: {
        platformQid: seed.qid,
        sourceType: SOURCE_TYPE,
        pageTitle: seed.rosterPageTitle,
        pageUrl,
        notes: seed.notes,
        isActive: true,
      },
    });

    if (!existingSource) sourceCreated += 1;
    else if (
      (existingSource.pageUrl ?? null) !== pageUrl ||
      (existingSource.notes ?? null) !== (seed.notes ?? null) ||
      existingSource.isActive !== true
    ) {
      sourceUpdated += 1;
    }
  }

  const [registryTotal, sourceTotal, snes] = await Promise.all([
    prisma.platformRegistry.count(),
    prisma.platformRosterSource.count(),
    prisma.platformRegistry.findUnique({
      where: { platformQid: "Q183259" },
      select: {
        platformQid: true,
        nameLabel: true,
        status: true,
        rosterSources: {
          where: { sourceType: SOURCE_TYPE },
          select: { pageTitle: true, pageUrl: true },
          orderBy: { pageTitle: "asc" },
        },
      },
    }),
  ]);

  const elapsedMs = Date.now() - startedAt;
  console.log(
    `bootstrapPlatforms: seeds=${seeds.length} registryCreated=${registryCreated} registryUpdated=${registryUpdated} sourceCreated=${sourceCreated} sourceUpdated=${sourceUpdated} sourceMigrated=${sourceMigrated} membershipsMigrated=${membershipsMigrated} registryTotal=${registryTotal} sourceTotal=${sourceTotal} elapsedMs=${elapsedMs}`,
  );

  if (snes) {
    console.log(
      `bootstrapPlatforms: check platformQid=${snes.platformQid} status=${snes.status} rosterSources=${snes.rosterSources.length} firstRosterTitle=${snes.rosterSources[0]?.pageTitle ?? "none"}`,
    );
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
