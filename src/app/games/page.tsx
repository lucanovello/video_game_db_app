import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toSingle } from "@/lib/validation";

const PAGE_SIZE = 24;

interface GamesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function buildGamesHref(params: {
  q: string;
  platform: string;
  year: string;
  includeJunk: boolean;
  page: number;
}): string {
  const urlParams = new URLSearchParams();
  if (params.q) urlParams.set("q", params.q);
  if (params.platform) urlParams.set("platform", params.platform);
  if (params.year) urlParams.set("year", params.year);
  if (params.includeJunk) urlParams.set("includeJunk", "1");
  urlParams.set("page", String(params.page));
  return `/games?${urlParams.toString()}`;
}

export default async function GamesPage({ searchParams }: GamesPageProps) {
  const params = await searchParams;

  const q = toSingle(params.q)?.trim() ?? "";
  const platform = toSingle(params.platform)?.trim() ?? "";
  const yearRaw = toSingle(params.year)?.trim() ?? "";
  const pageRaw = toSingle(params.page)?.trim() ?? "1";
  const includeJunk = (toSingle(params.includeJunk)?.trim() ?? "") === "1";

  const parsedYear = Number.parseInt(yearRaw, 10);
  const year = Number.isFinite(parsedYear) ? parsedYear : null;
  const page = Math.max(1, Number.parseInt(pageRaw, 10) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const where: Prisma.GameWhereInput = {};
  const and: Prisma.GameWhereInput[] = [];

  if (!includeJunk) and.push({ isJunk: false });
  if (q) and.push({ title: { contains: q, mode: "insensitive" } });
  if (platform) and.push({ platforms: { some: { platformQid: platform } } });
  if (year !== null) and.push({ releaseYear: year });
  if (and.length) where.AND = and;

  const [games, total, platformOptions] = await prisma.$transaction([
    prisma.game.findMany({
      where,
      orderBy: [{ releaseYear: "desc" }, { title: "asc" }],
      skip,
      take: PAGE_SIZE,
      select: {
        qid: true,
        title: true,
        description: true,
        releaseYear: true,
        imageUrl: true,
        platforms: {
          take: 3,
          select: {
            platform: {
              select: { qid: true, name: true },
            },
          },
        },
      },
    }),
    prisma.game.count({ where }),
    prisma.platform.findMany({
      where: { isMajor: true },
      orderBy: [{ sitelinks: "desc" }, { name: "asc" }],
      select: { qid: true, name: true },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const prevPage = Math.max(1, page - 1);
  const nextPage = Math.min(totalPages, page + 1);

  return (
    <section className="stack">
      <header className="stack">
        <h1 className="page-title">Games</h1>
        <p className="muted">Console-first catalog from Wikidata. Filter by platform and year.</p>
      </header>

      <form className="panel search-grid" action="/games" method="get">
        <label className="field">
          Search
          <input className="input" type="text" name="q" defaultValue={q} placeholder="Halo, Zelda..." />
        </label>

        <label className="field">
          Platform
          <select className="select" name="platform" defaultValue={platform}>
            <option value="">All major platforms</option>
            {platformOptions.map((option) => (
              <option key={option.qid} value={option.qid}>
                {option.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          Release year
          <input className="input" type="number" name="year" defaultValue={yearRaw} min={1950} max={2100} />
        </label>

        <label className="field">
          Include junk
          <input type="checkbox" name="includeJunk" value="1" defaultChecked={includeJunk} />
        </label>

        <div className="field">
          <span>Run query</span>
          <button className="button" type="submit">
            Search
          </button>
        </div>
      </form>

      <div className="inline-actions muted">
        <span>
          Showing {games.length} of {total} games
        </span>
      </div>

      <div className="games-grid">
        {games.map((game) => (
          <Link key={game.qid} className="game-card" href={`/games/${game.qid}`}>
            <h2 className="game-title">{game.title}</h2>
            <p className="meta">
              {game.qid}
              {game.releaseYear ? ` - ${game.releaseYear}` : ""}
            </p>
            {game.description ? <p className="meta">{game.description}</p> : null}
            <div className="chip-row">
              {game.platforms.map((entry) => (
                <span key={entry.platform.qid} className="chip">
                  {entry.platform.name}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>

      <div className="inline-actions">
        <Link
          className="button secondary"
          href={buildGamesHref({ q, platform, year: yearRaw, includeJunk, page: prevPage })}
          aria-disabled={page <= 1}
        >
          Previous
        </Link>
        <span className="muted">
          Page {page} / {totalPages}
        </span>
        <Link
          className="button secondary"
          href={buildGamesHref({ q, platform, year: yearRaw, includeJunk, page: nextPage })}
          aria-disabled={page >= totalPages}
        >
          Next
        </Link>
      </div>
    </section>
  );
}
