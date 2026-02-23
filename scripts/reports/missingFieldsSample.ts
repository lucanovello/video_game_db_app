import { CompanyRole, TagKind } from "@prisma/client";
import { prisma } from "../wikidata/lib/prisma";

interface CliOptions {
  platformQid: string | null;
  limit: number;
}

interface MissingSampleRow {
  qid: string;
  title: string;
  hasDescription: boolean;
  hasReleaseDate: boolean;
  hasGenre: boolean;
  hasDevOrPub: boolean;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseOptions(argv: string[]): CliOptions {
  const platformArg = argv.find(
    (value) =>
      value.startsWith("--platform=") || value.startsWith("--platform-qid="),
  );
  const limitArg = argv.find((value) => value.startsWith("--limit="));

  const platformQid = platformArg
    ? platformArg
        .slice(platformArg.indexOf("=") + 1)
        .trim()
        .toUpperCase()
    : null;

  if (platformQid && !/^Q\d+$/.test(platformQid)) {
    throw new Error(`Invalid platform QID: ${platformQid}`);
  }

  return {
    platformQid,
    limit: parsePositiveInt(limitArg?.slice("--limit=".length), 30),
  };
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));

  const memberships = await prisma.platformGameMembership.findMany({
    where: options.platformQid
      ? { platformQid: options.platformQid }
      : undefined,
    select: { gameQid: true },
  });

  const gameQids = [...new Set(memberships.map((row) => row.gameQid))];
  if (!gameQids.length) {
    throw new Error(
      options.platformQid
        ? `No PlatformGameMembership rows found for ${options.platformQid}.`
        : "No PlatformGameMembership rows found.",
    );
  }

  const [games, releaseRows, genreRows, companyRows] = await Promise.all([
    prisma.game.findMany({
      where: { qid: { in: gameQids } },
      select: { qid: true, title: true, description: true },
    }),
    prisma.releaseDate.findMany({
      where: { gameQid: { in: gameQids } },
      select: { gameQid: true },
      distinct: ["gameQid"],
    }),
    prisma.gameTag.findMany({
      where: {
        gameQid: { in: gameQids },
        tag: { kind: TagKind.GENRE },
      },
      select: { gameQid: true },
      distinct: ["gameQid"],
    }),
    prisma.gameCompany.findMany({
      where: {
        gameQid: { in: gameQids },
        role: { in: [CompanyRole.DEVELOPER, CompanyRole.PUBLISHER] },
      },
      select: { gameQid: true },
      distinct: ["gameQid"],
    }),
  ]);

  const releaseSet = new Set(releaseRows.map((row) => row.gameQid));
  const genreSet = new Set(genreRows.map((row) => row.gameQid));
  const companySet = new Set(companyRows.map((row) => row.gameQid));

  const byQid = new Map(games.map((row) => [row.qid, row] as const));

  const rows: MissingSampleRow[] = [];
  for (const qid of gameQids) {
    const game = byQid.get(qid);

    const hasDescription = Boolean(game?.description?.trim());
    const hasReleaseDate = releaseSet.has(qid);
    const hasGenre = genreSet.has(qid);
    const hasDevOrPub = companySet.has(qid);

    if (hasDescription && hasReleaseDate && hasGenre && hasDevOrPub) {
      continue;
    }

    rows.push({
      qid,
      title: game?.title ?? "(missing game row)",
      hasDescription,
      hasReleaseDate,
      hasGenre,
      hasDevOrPub,
    });
  }

  rows.sort((a, b) => a.qid.localeCompare(b.qid));
  const sample = rows.slice(0, options.limit);

  const lines: string[] = [];
  lines.push(
    [
      "qid",
      "title",
      "hasDescription",
      "hasReleaseDate",
      "hasGenre",
      "hasDevOrPub",
    ].join(","),
  );

  for (const row of sample) {
    lines.push(
      [
        row.qid,
        csvEscape(row.title),
        row.hasDescription ? "true" : "false",
        row.hasReleaseDate ? "true" : "false",
        row.hasGenre ? "true" : "false",
        row.hasDevOrPub ? "true" : "false",
      ].join(","),
    );
  }

  process.stdout.write(lines.join("\n"));
  process.stdout.write("\n");
  console.log(
    `missingFieldsSample: candidates=${rows.length} returned=${sample.length} scopeGames=${gameQids.length}`,
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
