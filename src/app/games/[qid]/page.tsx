import Link from "next/link";
import { notFound } from "next/navigation";
import { CompanyRole, TagKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";

interface GameDetailPageProps {
  params: Promise<{ qid: string }>;
}

function sortByLabel<T extends { label: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.label.localeCompare(b.label));
}

function toPlatformHref(platform: {
  slug: string | null;
  qid: string;
}): string {
  const qidSuffix = platform.qid.toLowerCase();
  if (!platform.slug) return `/platforms/${qidSuffix}`;
  return `/platforms/${platform.slug}-${qidSuffix}`;
}

export default async function GameDetailPage({ params }: GameDetailPageProps) {
  const { qid } = await params;

  const game = await prisma.game.findUnique({
    where: { qid },
    include: {
      platforms: {
        select: {
          platform: {
            select: { qid: true, slug: true, name: true },
          },
        },
      },
      tags: {
        select: {
          tag: {
            select: { id: true, kind: true, label: true },
          },
        },
      },
      companies: {
        select: {
          role: true,
          company: {
            select: { qid: true, name: true },
          },
        },
      },
      reviews: {
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { handle: true } },
        },
      },
    },
  });

  if (!game) notFound();

  const tagGroups = {
    genres: sortByLabel(
      game.tags
        .filter((entry) => entry.tag.kind === TagKind.GENRE)
        .map((entry) => entry.tag),
    ),
    series: sortByLabel(
      game.tags
        .filter((entry) => entry.tag.kind === TagKind.SERIES)
        .map((entry) => entry.tag),
    ),
    engines: sortByLabel(
      game.tags
        .filter((entry) => entry.tag.kind === TagKind.ENGINE)
        .map((entry) => entry.tag),
    ),
    modes: sortByLabel(
      game.tags
        .filter((entry) => entry.tag.kind === TagKind.MODE)
        .map((entry) => entry.tag),
    ),
  };

  const developers = game.companies
    .filter((entry) => entry.role === CompanyRole.DEVELOPER)
    .map((entry) => entry.company);
  const publishers = game.companies
    .filter((entry) => entry.role === CompanyRole.PUBLISHER)
    .map((entry) => entry.company);

  const platformNames = game.platforms.map((entry) => entry.platform.name);

  return (
    <section className='stack detail-page'>
      <header className='panel stack detail-header'>
        <h1 className='page-title'>{game.title}</h1>
        <p className='meta'>{game.qid}</p>
        {game.imageUrl ? (
          <img
            className='entity-hero'
            src={game.imageUrl}
            alt={`${game.title} cover`}
            loading='lazy'
          />
        ) : null}
        {game.description ? <p className='muted'>{game.description}</p> : null}
        <div className='chip-row'>
          <span className='chip'>Release year: {game.releaseYear ?? "n/a"}</span>
          <span className='chip'>Reviews: {game.reviews.length}</span>
        </div>
      </header>

      <div className='two-col'>
        <div className='stack'>
          <section className='panel stack'>
            <h2 className='game-title'>Quick facts</h2>
            <dl className='detail-grid'>
              <div className='detail-row'>
                <dt>QID</dt>
                <dd>{game.qid}</dd>
              </div>
              <div className='detail-row'>
                <dt>Release year</dt>
                <dd>{game.releaseYear ?? "n/a"}</dd>
              </div>
              <div className='detail-row'>
                <dt>Platforms</dt>
                <dd>
                  {platformNames.length ? platformNames.join(", ") : "n/a"}
                </dd>
              </div>
              <div className='detail-row'>
                <dt>Developers</dt>
                <dd>
                  {developers.length
                    ? developers.map((item) => item.name).join(", ")
                    : "n/a"}
                </dd>
              </div>
              <div className='detail-row'>
                <dt>Publishers</dt>
                <dd>
                  {publishers.length
                    ? publishers.map((item) => item.name).join(", ")
                    : "n/a"}
                </dd>
              </div>
            </dl>
          </section>

          <section className='panel stack'>
            <h2 className='game-title'>Platforms</h2>
            <div className='chip-row'>
              {game.platforms.length ? (
                game.platforms.map((entry) => (
                  <Link
                    key={entry.platform.qid}
                    className='chip chip-link'
                    href={toPlatformHref(entry.platform)}
                  >
                    {entry.platform.name}
                  </Link>
                ))
              ) : (
                <p className='muted'>No linked platforms.</p>
              )}
            </div>
          </section>

          <section className='panel stack'>
            <h2 className='game-title'>Metadata</h2>
            <div className='chip-row'>
              {tagGroups.genres.map((tag) => (
                <span key={tag.id} className='chip'>
                  Genre: {tag.label}
                </span>
              ))}
              {tagGroups.series.map((tag) => (
                <span key={tag.id} className='chip'>
                  Series: {tag.label}
                </span>
              ))}
              {tagGroups.engines.map((tag) => (
                <span key={tag.id} className='chip'>
                  Engine: {tag.label}
                </span>
              ))}
              {tagGroups.modes.map((tag) => (
                <span key={tag.id} className='chip'>
                  Mode: {tag.label}
                </span>
              ))}
            </div>
            {!tagGroups.genres.length &&
            !tagGroups.series.length &&
            !tagGroups.engines.length &&
            !tagGroups.modes.length ? (
              <p className='muted'>No metadata tags available.</p>
            ) : null}
          </section>

          <section className='panel stack'>
            <h2 className='game-title'>Reviews</h2>
            {game.reviews.length ? (
              <ul className='list-reset'>
                {game.reviews.map((review) => (
                  <li key={review.id} className='review-item stack'>
                    <p className='meta'>
                      @{review.user.handle}
                      {review.rating !== null ? ` • ${review.rating}/10` : ""}
                    </p>
                    {review.body ? (
                      <p>{review.body}</p>
                    ) : (
                      <p className='meta'>No text review.</p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className='muted'>No reviews yet.</p>
            )}
          </section>
        </div>

        <aside className='stack detail-sidebar'>
          <form className='panel stack' action='/api/logs' method='post'>
            <h2 className='game-title'>Log Play</h2>
            <input type='hidden' name='gameQid' value={game.qid} />
            <input
              type='hidden'
              name='redirectTo'
              value={`/games/${game.qid}`}
            />

            <label className='field'>
              Handle
              <input
                className='input'
                name='handle'
                defaultValue='demo_user'
                required
              />
            </label>
            <label className='field'>
              Played on
              <input className='input' type='date' name='playedOn' />
            </label>
            <label className='field'>
              Notes
              <textarea
                className='textarea'
                name='notes'
                placeholder='Session notes...'
              />
            </label>
            <button className='button' type='submit'>
              Save log
            </button>
          </form>

          <form className='panel stack' action='/api/reviews' method='post'>
            <h2 className='game-title'>Write / Update Review</h2>
            <input type='hidden' name='gameQid' value={game.qid} />
            <input
              type='hidden'
              name='redirectTo'
              value={`/games/${game.qid}`}
            />

            <label className='field'>
              Handle
              <input
                className='input'
                name='handle'
                defaultValue='demo_user'
                required
              />
            </label>
            <label className='field'>
              Rating (1-10)
              <input
                className='input'
                type='number'
                name='rating'
                min={1}
                max={10}
              />
            </label>
            <label className='field'>
              Review
              <textarea
                className='textarea'
                name='body'
                placeholder='Why did this game work (or not)?'
              />
            </label>
            <button className='button secondary' type='submit'>
              Save review
            </button>
          </form>
        </aside>
      </div>
    </section>
  );
}
