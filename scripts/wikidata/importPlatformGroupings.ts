import { readFile } from "node:fs/promises";
import { prisma } from "./lib/prisma";

type SeedRow = {
  grouping: string;
  count: string;
  sample: string;
};

type MajorOverrides = Record<string, boolean>;

function parseQidFromEntityUrl(value: string, label: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/\/entity\/(Q\d+)$/);
  if (!match) {
    throw new Error(`importPlatformGroupings: invalid ${label} url: ${value}`);
  }
  return match[1];
}

function parseCount(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`importPlatformGroupings: invalid count: ${value}`);
  }
  return parsed;
}

async function tryReadMajorOverrides(): Promise<MajorOverrides | null> {
  try {
    const raw = await readFile(
      new URL("./seeds/major-platform-overrides.json", import.meta.url),
      "utf8",
    );
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      throw new Error("major-platform-overrides.json must be an object");
    }
    return parsed as MajorOverrides;
  } catch (error) {
    // If the file doesn't exist or is unreadable, treat as absent.
    // JSON parse errors should surface.
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("enoent")) return null;
    if (message.toLowerCase().includes("no such file")) return null;
    if (message.toLowerCase().includes("cannot find")) return null;
    if (message.toLowerCase().includes("file not found")) return null;
    throw error;
  }
}

function byExpectedCountDesc(
  a: { wikiProjectGameCount: number },
  b: { wikiProjectGameCount: number },
) {
  return b.wikiProjectGameCount - a.wikiProjectGameCount;
}

async function main() {
  const seedPath = new URL(
    "./seeds/wvg-platform-groupings.json",
    import.meta.url,
  );
  const raw = await readFile(seedPath, "utf8");
  const parsed = JSON.parse(raw) as SeedRow[];

  if (!Array.isArray(parsed)) {
    throw new Error("importPlatformGroupings: seed JSON must be an array");
  }

  const overrides = await tryReadMajorOverrides();

  const rows = parsed.map((row) => {
    const platformQid = parseQidFromEntityUrl(row.grouping, "grouping");
    const sampleGameQid = parseQidFromEntityUrl(row.sample, "sample");
    const wikiProjectGameCount = parseCount(row.count);
    const overrideIsMajor = overrides?.[platformQid];

    return {
      platformQid,
      wikiProjectGameCount,
      sampleGameQid,
      overrideIsMajor,
    };
  });

  let created = 0;
  let updated = 0;
  let total = 0;

  for (const row of rows) {
    total += 1;

    const isMajor = row.overrideIsMajor ?? false;

    const existing = await prisma.platform.findUnique({
      where: { qid: row.platformQid },
      select: { qid: true },
    });

    if (existing) {
      await prisma.platform.update({
        where: { qid: row.platformQid },
        data: {
          wikiProjectGameCount: row.wikiProjectGameCount,
          sampleGameQid: row.sampleGameQid,
          isMajor,
        },
      });
      updated += 1;
      continue;
    }

    await prisma.platform.create({
      data: {
        qid: row.platformQid,
        name: row.platformQid,
        description: null,
        sitelinks: 0,
        isMajor,
        wikiProjectGameCount: row.wikiProjectGameCount,
        sampleGameQid: row.sampleGameQid,
      },
    });

    created += 1;
  }

  const top = [...rows]
    .sort(byExpectedCountDesc)
    .slice(0, 10)
    .map((row) => `${row.platformQid} (${row.wikiProjectGameCount})`)
    .join(", ");

  const overridesCount = overrides ? Object.keys(overrides).length : 0;

  console.log(
    `importPlatformGroupings: platforms=${total} created=${created} updated=${updated} overrides=${overridesCount}`,
  );
  console.log(`importPlatformGroupings: top10=${top}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
