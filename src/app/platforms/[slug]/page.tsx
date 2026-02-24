import Link from "next/link";
import { notFound } from "next/navigation";
import { CompanyRole, TagKind, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toSingle } from "@/lib/validation";
import { getPlatformImageUrlFromClaims } from "@/lib/wikidata-image";

const PAGE_SIZE = 50;

interface PlatformDetailPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type SortKey = "title" | "developer" | "genre" | "release";
type SortOrder = "asc" | "desc";

interface PlatformGameRow {
  qid: string;
  title: string;
  releaseYear: number | null;
  firstReleaseAt: Date | null;
  developer: string | null;
  genre: string | null;
}

function parsePlatformRouteParam(value: string): {
  qid: string | null;
  slug: string | null;
} {
  const qidMatch = value.match(/-(q\d+)$/i);
  if (qidMatch) {
    const suffix = qidMatch[1];
    const parsedSlug = value.slice(0, value.length - suffix.length - 1).trim();
    return {
      qid: suffix.toUpperCase(),
      slug: parsedSlug || null,
    };
  }

  if (/^q\d+$/i.test(value)) {
    return { qid: value.toUpperCase(), slug: null };
  }

  return { qid: null, slug: value };
}

function formatPlatformType(value: string | null): string | null {
  if (!value) return null;
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildPlatformDetailHref(params: {
  slug: string;
  includeJunk: boolean;
  page: number;
  sort: SortKey;
  order: SortOrder;
}): string {
  const urlParams = new URLSearchParams();
  if (params.includeJunk) urlParams.set("includeJunk", "1");
  if (params.sort !== "release") urlParams.set("sort", params.sort);
  if (params.order !== "desc") urlParams.set("order", params.order);
  urlParams.set("page", String(params.page));
  return `/platforms/${params.slug}?${urlParams.toString()}`;
}

function parseSortKey(value: string | null): SortKey {
  if (
    value === "title" ||
    value === "developer" ||
    value === "genre" ||
    value === "release"
  ) {
    return value;
  }
  return "release";
}

function parseSortOrder(value: string | null): SortOrder {
  return value === "asc" ? "asc" : "desc";
}

function formatRelease(value: {
  firstReleaseAt: Date | null;
  releaseYear: number | null;
}): string {
  if (value.firstReleaseAt) {
    return value.firstReleaseAt.toISOString().slice(0, 10);
  }
  if (value.releaseYear !== null) {
    return String(value.releaseYear);
  }
  return "n/a";
}

function compareString(
  left: string | null,
  right: string | null,
  order: SortOrder,
): number {
  const leftValue = (left ?? "").toLowerCase();
  const rightValue = (right ?? "").toLowerCase();
  const base = leftValue.localeCompare(rightValue);
  return order === "asc" ? base : -base;
}

function compareNumber(left: number, right: number, order: SortOrder): number {
  const base = left - right;
  return order === "asc" ? base : -base;
}

function sortRows(
  rows: PlatformGameRow[],
  sort: SortKey,
  order: SortOrder,
): PlatformGameRow[] {
  return [...rows].sort((left, right) => {
    if (sort === "title") {
      const primary = compareString(left.title, right.title, order);
      if (primary !== 0) return primary;
      return compareNumber(
        left.releaseYear ?? 9999,
        right.releaseYear ?? 9999,
        "asc",
      );
    }

    if (sort === "developer") {
      const primary = compareString(left.developer, right.developer, order);
      if (primary !== 0) return primary;
      return compareString(left.title, right.title, "asc");
    }

    if (sort === "genre") {
      const primary = compareString(left.genre, right.genre, order);
      if (primary !== 0) return primary;
      return compareString(left.title, right.title, "asc");
    }

    const leftDate =
      left.firstReleaseAt?.getTime() ?? (left.releaseYear ?? 0) * 1000;
    const rightDate =
      right.firstReleaseAt?.getTime() ?? (right.releaseYear ?? 0) * 1000;
    const primary = compareNumber(leftDate, rightDate, order);
    if (primary !== 0) return primary;
    return compareString(left.title, right.title, "asc");
  });
}

function nextOrder(
  currentSort: SortKey,
  currentOrder: SortOrder,
  targetSort: SortKey,
): SortOrder {
  if (currentSort !== targetSort)
    return targetSort === "title" ? "asc" : "desc";
  return currentOrder === "asc" ? "desc" : "asc";
}

function sortLabel(
  base: string,
  currentSort: SortKey,
  currentOrder: SortOrder,
  targetSort: SortKey,
): string {
  if (currentSort !== targetSort) return base;
  return `${base} ${currentOrder === "asc" ? "↑" : "↓"}`;
}

export default async function PlatformDetailPage({
  params,
  searchParams,
}: PlatformDetailPageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const route = parsePlatformRouteParam(slug);

  const includeJunk = (toSingle(query.includeJunk)?.trim() ?? "") === "1";
  const sort = parseSortKey(toSingle(query.sort)?.trim() ?? null);
  const order = parseSortOrder(toSingle(query.order)?.trim() ?? null);
  const pageRaw = toSingle(query.page)?.trim() ?? "1";
  const page = Math.max(1, Number.parseInt(pageRaw, 10) || 1);

  let dbUnavailable = false;

  let platform: {
    qid: string;
    slug: string | null;
    name: string;
    description: string | null;
    releaseYear: number | null;
    type: string | null;
    sitelinks: number;
    wikiProjectGameCount: number | null;
    url: string | null;
    claimsJson: Prisma.JsonValue | null;
  } | null = null;

  try {
    platform = await prisma.platform.findFirst({
      where: {
        OR: [
          ...(route.qid ? [{ qid: route.qid }] : []),
          ...(route.slug ? [{ slug: route.slug }] : []),
        ],
      },
      select: {
        qid: true,
        slug: true,
        name: true,
        description: true,
        releaseYear: true,
        type: true,
        sitelinks: true,
        wikiProjectGameCount: true,
        url: true,
        claimsJson: true,
      },
    });
  } catch (error: unknown) {
    dbUnavailable = true;
    console.error("platform-detail-page: failed to query platform", error);
  }

  if (dbUnavailable) {
    return (
      <section className='stack'>
        <header className='stack'>
          <h1 className='page-title'>Platform unavailable</h1>
          <p className='muted'>
            Could not load platform details because the database connection
            failed. Start Postgres (or verify `DATABASE_URL`) and refresh.
          </p>
          <div className='inline-actions'>
            <Link className='button secondary' href='/platforms'>
              Back to platforms
            </Link>
          </div>
        </header>
      </section>
    );
  }

  if (!platform) notFound();

  const where: Prisma.GameWhereInput = {
    platforms: { some: { platformQid: platform.qid } },
  };

  if (!includeJunk) {
    where.AND = [{ isJunk: false }];
  }

  let games: PlatformGameRow[] = [];
  let total = 0;

  try {
    const gameRows = await prisma.game.findMany({
      where,
      select: {
        qid: true,
        title: true,
        releaseYear: true,
        firstReleaseAt: true,
        companies: {
          where: { role: CompanyRole.DEVELOPER },
          take: 1,
          select: {
            company: {
              select: { name: true },
            },
          },
        },
        tags: {
          where: { tag: { kind: TagKind.GENRE } },
          take: 1,
          select: {
            tag: {
              select: { label: true },
            },
          },
        },
      },
    });

    total = gameRows.length;
    const sorted = sortRows(
      gameRows.map((game) => ({
        qid: game.qid,
        title: game.title,
        releaseYear: game.releaseYear,
        firstReleaseAt: game.firstReleaseAt,
        developer: game.companies[0]?.company.name ?? null,
        genre: game.tags[0]?.tag.label ?? null,
      })),
      sort,
      order,
    );

    const skip = (page - 1) * PAGE_SIZE;
    games = sorted.slice(skip, skip + PAGE_SIZE);
  } catch (error: unknown) {
    dbUnavailable = true;
    console.error("platform-detail-page: failed to query game list", error);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const prevPage = Math.max(1, page - 1);
  const nextPage = Math.min(totalPages, page + 1);
  const platformImageUrl = getPlatformImageUrlFromClaims(platform.claimsJson);
  const routeSlug = platform.slug
    ? `${platform.slug}-${platform.qid.toLowerCase()}`
    : platform.qid.toLowerCase();

  return (
    <section className='stack'>
      <header className='stack'>
        <h1 className='page-title'>{platform.name}</h1>
        {platformImageUrl ? (
          <img
            className='entity-hero'
            src={platformImageUrl}
            alt={`${platform.name} image`}
            loading='lazy'
          />
        ) : null}
        {platform.description ? (
          <p className='muted'>{platform.description}</p>
        ) : null}
      </header>

      <section className='panel stack'>
        <h2 className='game-title'>Quick facts</h2>
        <dl className='detail-grid'>
          <div className='detail-row'>
            <dt>QID</dt>
            <dd>{platform.qid}</dd>
          </div>
          <div className='detail-row'>
            <dt>Release year</dt>
            <dd>{platform.releaseYear ?? "n/a"}</dd>
          </div>
          <div className='detail-row'>
            <dt>Type</dt>
            <dd>{formatPlatformType(platform.type) ?? "n/a"}</dd>
          </div>
          <div className='detail-row'>
            <dt>Sitelinks</dt>
            <dd>{platform.sitelinks}</dd>
          </div>
          <div className='detail-row'>
            <dt>WVG games</dt>
            <dd>{platform.wikiProjectGameCount ?? "n/a"}</dd>
          </div>
          <div className='detail-row'>
            <dt>External</dt>
            <dd>
              {platform.url ? (
                <Link
                  className='text-link strong-link'
                  href={platform.url}
                  target='_blank'
                  rel='noreferrer'
                >
                  Open reference page
                </Link>
              ) : (
                "n/a"
              )}
            </dd>
          </div>
        </dl>
      </section>

      <form
        className='panel search-grid'
        action={`/platforms/${routeSlug}`}
        method='get'
      >
        <label className='field'>
          Include junk
          <input
            type='checkbox'
            name='includeJunk'
            value='1'
            defaultChecked={includeJunk}
          />
        </label>
        <div className='field'>
          <span>Refresh list</span>
          <button className='button' type='submit'>
            Apply
          </button>
        </div>
      </form>

      <section className='panel stack'>
        <h2 className='game-title'>Games on this platform</h2>
        {dbUnavailable ? (
          <p className='muted'>
            Could not load the game list because the database connection failed.
          </p>
        ) : null}
        <p className='muted'>
          Showing {games.length} of {total} games
        </p>
        {games.length ? (
          <div className='table-wrap'>
            <table className='data-table'>
              <thead>
                <tr>
                  <th>
                    <Link
                      className='table-sort'
                      href={buildPlatformDetailHref({
                        slug: routeSlug,
                        includeJunk,
                        page: 1,
                        sort: "title",
                        order: nextOrder(sort, order, "title"),
                      })}
                    >
                      {sortLabel("Title", sort, order, "title")}
                    </Link>
                  </th>
                  <th>
                    <Link
                      className='table-sort'
                      href={buildPlatformDetailHref({
                        slug: routeSlug,
                        includeJunk,
                        page: 1,
                        sort: "developer",
                        order: nextOrder(sort, order, "developer"),
                      })}
                    >
                      {sortLabel("Developer", sort, order, "developer")}
                    </Link>
                  </th>
                  <th>
                    <Link
                      className='table-sort'
                      href={buildPlatformDetailHref({
                        slug: routeSlug,
                        includeJunk,
                        page: 1,
                        sort: "genre",
                        order: nextOrder(sort, order, "genre"),
                      })}
                    >
                      {sortLabel("Genre", sort, order, "genre")}
                    </Link>
                  </th>
                  <th>
                    <Link
                      className='table-sort'
                      href={buildPlatformDetailHref({
                        slug: routeSlug,
                        includeJunk,
                        page: 1,
                        sort: "release",
                        order: nextOrder(sort, order, "release"),
                      })}
                    >
                      {sortLabel("Release date", sort, order, "release")}
                    </Link>
                  </th>
                </tr>
              </thead>
              <tbody>
                {games.map((game) => (
                  <tr key={game.qid}>
                    <td>
                      <Link
                        className='text-link strong-link'
                        href={`/games/${game.qid}`}
                      >
                        {game.title}
                      </Link>
                    </td>
                    <td>{game.developer ?? "n/a"}</td>
                    <td>{game.genre ?? "n/a"}</td>
                    <td>{formatRelease(game)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <section className='empty-state'>
            <p className='muted'>
              No games found for the current filter. Try enabling junk entries
              or changing the sort.
            </p>
          </section>
        )}
      </section>

      <div className='inline-actions'>
        {page <= 1 ? (
          <span className='button secondary is-disabled'>Previous</span>
        ) : (
          <Link
            className='button secondary'
            href={buildPlatformDetailHref({
              slug: routeSlug,
              includeJunk,
              page: prevPage,
              sort,
              order,
            })}
          >
            Previous
          </Link>
        )}
        <span className='muted'>
          Page {page} / {totalPages}
        </span>
        {page >= totalPages ? (
          <span className='button secondary is-disabled'>Next</span>
        ) : (
          <Link
            className='button secondary'
            href={buildPlatformDetailHref({
              slug: routeSlug,
              includeJunk,
              page: nextPage,
              sort,
              order,
            })}
          >
            Next
          </Link>
        )}
      </div>
    </section>
  );
}
