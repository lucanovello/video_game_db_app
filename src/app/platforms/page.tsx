import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toSingle } from "@/lib/validation";
import { getPlatformImageUrlFromClaims } from "@/lib/wikidata-image";

const PAGE_SIZE = 24;

interface PlatformsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function buildPlatformsHref(params: { q: string; page: number }): string {
  const urlParams = new URLSearchParams();
  if (params.q) urlParams.set("q", params.q);
  urlParams.set("page", String(params.page));
  return `/platforms?${urlParams.toString()}`;
}

function toPlatformHref(platform: {
  slug: string | null;
  qid: string;
}): string {
  const qidSuffix = platform.qid.toLowerCase();
  if (!platform.slug) return `/platforms/${qidSuffix}`;
  return `/platforms/${platform.slug}-${qidSuffix}`;
}

function formatPlatformType(value: string | null): string | null {
  if (!value) return null;
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function PlatformsPage({
  searchParams,
}: PlatformsPageProps) {
  const params = await searchParams;

  const q = toSingle(params.q)?.trim() ?? "";
  const pageRaw = toSingle(params.page)?.trim() ?? "1";
  const page = Math.max(1, Number.parseInt(pageRaw, 10) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const where: Prisma.PlatformWhereInput = {};

  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  let platforms: Array<{
    qid: string;
    slug: string | null;
    name: string;
    description: string | null;
    releaseYear: number | null;
    type: string | null;
    sitelinks: number;
    wikiProjectGameCount: number | null;
    claimsJson: Prisma.JsonValue | null;
  }> = [];
  let total = 0;
  let dbUnavailable = false;

  try {
    const [platformRows, totalRows] = await prisma.$transaction([
      prisma.platform.findMany({
        where,
        orderBy: [{ sitelinks: "desc" }, { name: "asc" }],
        skip,
        take: PAGE_SIZE,
        select: {
          qid: true,
          slug: true,
          name: true,
          description: true,
          releaseYear: true,
          type: true,
          sitelinks: true,
          wikiProjectGameCount: true,
          claimsJson: true,
        },
      }),
      prisma.platform.count({ where }),
    ]);

    platforms = platformRows;
    total = totalRows;
  } catch (error: unknown) {
    dbUnavailable = true;
    console.error("platforms-page: failed to query platform list", error);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const prevPage = Math.max(1, page - 1);
  const nextPage = Math.min(totalPages, page + 1);

  return (
    <section className='stack'>
      <header className='stack'>
        <h1 className='page-title'>Platforms</h1>
        <p className='muted'>
          Search all catalog platforms, then open a platform page with its game
          roster.
        </p>
      </header>

      <form className='panel search-grid' action='/platforms' method='get'>
        <label className='field'>
          Search
          <input
            className='input'
            type='text'
            name='q'
            defaultValue={q}
            placeholder='PlayStation, Nintendo, Sega...'
          />
        </label>

        <div className='field'>
          <span>Run query</span>
          <button className='button' type='submit'>
            Search
          </button>
        </div>
      </form>

      {dbUnavailable ? (
        <section className='panel stack'>
          <h2 className='game-title'>Database unavailable</h2>
          <p className='muted'>
            Could not load platforms because the database connection failed.
            Start Postgres (or verify `DATABASE_URL`) and refresh this page.
          </p>
        </section>
      ) : null}

      <div className='inline-actions muted'>
        <span>
          Showing {platforms.length} of {total} platforms
        </span>
      </div>

      <div className='games-grid'>
        {platforms.map((platform) => {
          const imageUrl = getPlatformImageUrlFromClaims(platform.claimsJson);

          return (
            <Link
              key={platform.qid}
              className='game-card'
              href={toPlatformHref(platform)}
            >
              {imageUrl ? (
                <img
                  className='entity-thumb'
                  src={imageUrl}
                  alt={`${platform.name} image`}
                  loading='lazy'
                />
              ) : null}
              <h2 className='game-title'>{platform.name}</h2>
              <p className='meta'>
                {platform.qid}
                {platform.releaseYear ? ` - ${platform.releaseYear}` : ""}
              </p>
              {platform.description ? (
                <p className='meta'>{platform.description}</p>
              ) : null}
              <div className='chip-row'>
                {platform.type ? (
                  <span className='chip'>{formatPlatformType(platform.type)}</span>
                ) : null}
                <span className='chip'>Sitelinks: {platform.sitelinks}</span>
                {platform.wikiProjectGameCount !== null ? (
                  <span className='chip'>
                    WVG games: {platform.wikiProjectGameCount}
                  </span>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>

      {!dbUnavailable && platforms.length === 0 ? (
        <section className='panel stack empty-state'>
          <h2 className='game-title'>No platforms found</h2>
          <p className='muted'>
            Try another search term to find platforms in the catalog.
          </p>
        </section>
      ) : null}

      <div className='inline-actions'>
        {page <= 1 ? (
          <span className='button secondary is-disabled'>Previous</span>
        ) : (
          <Link
            className='button secondary'
            href={buildPlatformsHref({ q, page: prevPage })}
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
            href={buildPlatformsHref({ q, page: nextPage })}
          >
            Next
          </Link>
        )}
      </div>
    </section>
  );
}
