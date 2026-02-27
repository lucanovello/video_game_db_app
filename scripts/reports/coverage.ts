import { CompanyRole, TagKind } from "@prisma/client";
import { prisma } from "../wikidata/lib/prisma";

interface CoverageRow {
  platformQid: string;
  platformName: string;
  totalGames: number;
  withReleaseDate: number;
  withGenre: number;
  withDevOrPub: number;
}

function parsePlatformArg(argv: string[]): string | null {
  const arg = argv.find(
    (value) =>
      value.startsWith("--platform=") || value.startsWith("--platform-qid="),
  );
  if (!arg) return null;

  const value = arg
    .slice(arg.indexOf("=") + 1)
    .trim()
    .toUpperCase();
  if (!value) return null;
  if (!/^Q\d+$/.test(value)) {
    throw new Error(`Invalid platform QID: ${value}`);
  }

  return value;
}

function pct(numerator: number, denominator: number): string {
  if (denominator <= 0) return "0.0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

async function buildCoverageRow(
  platformQid: string,
  platformName: string,
): Promise<CoverageRow> {
  const memberships = await prisma.platformGameMembership.findMany({
    where: { platformQid },
    select: { gameQid: true },
  });

  const gameQids = [...new Set(memberships.map((row) => row.gameQid))];
  if (!gameQids.length) {
    return {
      platformQid,
      platformName,
      totalGames: 0,
      withReleaseDate: 0,
      withGenre: 0,
      withDevOrPub: 0,
    };
  }

  const [releaseRows, genreRows, companyRows] = await Promise.all([
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

  return {
    platformQid,
    platformName,
    totalGames: gameQids.length,
    withReleaseDate: releaseRows.length,
    withGenre: genreRows.length,
    withDevOrPub: companyRows.length,
  };
}

async function main() {
  const startedAt = Date.now();
  const platformFilter = parsePlatformArg(process.argv.slice(2));

  const platforms = await prisma.platformRegistry.findMany({
    where: {
      status: "ACTIVE",
      ...(platformFilter ? { platformQid: platformFilter } : {}),
    },
    select: {
      platformQid: true,
      nameLabel: true,
    },
    orderBy: [{ nameLabel: "asc" }],
  });

  if (!platforms.length) {
    throw new Error(
      platformFilter
        ? `No PlatformRegistry row found for ${platformFilter}.`
        : "No platforms found in PlatformRegistry.",
    );
  }

  const rows: CoverageRow[] = [];
  for (const platform of platforms) {
    rows.push(await buildCoverageRow(platform.platformQid, platform.nameLabel));
  }

  const lines: string[] = [];
  lines.push(
    [
      "platformQid",
      "platformName",
      "games",
      "withReleaseDate",
      "releaseDatePct",
      "withGenre",
      "genrePct",
      "withDevOrPub",
      "devOrPubPct",
    ].join(","),
  );

  for (const row of rows) {
    lines.push(
      [
        row.platformQid,
        csvEscape(row.platformName),
        String(row.totalGames),
        String(row.withReleaseDate),
        pct(row.withReleaseDate, row.totalGames),
        String(row.withGenre),
        pct(row.withGenre, row.totalGames),
        String(row.withDevOrPub),
        pct(row.withDevOrPub, row.totalGames),
      ].join(","),
    );
  }

  const totalGames = rows.reduce((sum, row) => sum + row.totalGames, 0);
  const totalRelease = rows.reduce((sum, row) => sum + row.withReleaseDate, 0);
  const totalGenre = rows.reduce((sum, row) => sum + row.withGenre, 0);
  const totalCompany = rows.reduce((sum, row) => sum + row.withDevOrPub, 0);

  lines.push(
    [
      "ALL",
      "All platforms",
      String(totalGames),
      String(totalRelease),
      pct(totalRelease, totalGames),
      String(totalGenre),
      pct(totalGenre, totalGames),
      String(totalCompany),
      pct(totalCompany, totalGames),
    ].join(","),
  );

  process.stdout.write(lines.join("\n"));
  process.stdout.write("\n");

  const elapsedMs = Date.now() - startedAt;
  console.log(`coverage: platforms=${rows.length} elapsedMs=${elapsedMs}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
