import Link from "next/link";
import { notFound } from "next/navigation";
import { CompanyRole, TagKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import Image from "next/image";

interface GameDetailPageProps {
  params: Promise<{ qid: string }>;
}

function toPlatformHref(platform: {
  slug: string | null;
  qid: string;
}): string {
  const qidSuffix = platform.qid.toLowerCase();
  return platform.slug
    ? `/platforms/${platform.slug}-${qidSuffix}`
    : `/platforms/${qidSuffix}`;
}

function toTagHref(tag: { kind: TagKind; id: string; label: string }): string {
  const slug = tag.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `/tags/${tag.kind.toLowerCase()}/${slug}-${tag.id.toLowerCase()}`;
}

function sortByLabel<T extends { label: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.label.localeCompare(b.label));
}

export default async function GameDetailPage({ params }: GameDetailPageProps) {
  const { qid } = await params;

  const game = await prisma.game.findUnique({
    where: { qid },
    include: {
      platforms: {
        include: {
          platform: {
            select: {
              qid: true,
              slug: true,
              name: true,
              controllers: {
                select: {
                  controller: { select: { qid: true, name: true } },
                },
              },
            },
          },
        },
      },
      tags: { include: { tag: true } },
      companies: { include: { company: true } },
      reviews: {
        orderBy: { createdAt: "desc" },
        include: { user: { select: { handle: true } } },
      },
      scores: {
        orderBy: [{ provider: "asc" }],
        select: { provider: true, score: true, count: true },
      },
      releaseDates: {
        orderBy: [{ date: "asc" }, { year: "asc" }],
        include: {
          platform: { select: { qid: true, slug: true, name: true } },
        },
      },
      websites: { orderBy: { category: "asc" } },
      externalGames: { orderBy: { category: "asc" } },
      outgoingRelations: {
        orderBy: { kind: "asc" },
        include: { toGame: { select: { qid: true, title: true } } },
      },
      incomingRelations: {
        orderBy: { kind: "asc" },
        include: { fromGame: { select: { qid: true, title: true } } },
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

  const compatibleControllers = [
    ...new Map(
      game.platforms.flatMap((entry) =>
        entry.platform.controllers.map((link) => [
          link.controller.qid,
          link.controller,
        ]),
      ),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const developers = game.companies.filter(
    (entry) => entry.role === CompanyRole.DEVELOPER,
  );
  const publishers = game.companies.filter(
    (entry) => entry.role === CompanyRole.PUBLISHER,
  );

  return (
    <section className='stack detail-page'>
      <header className='panel stack detail-header'>
        <h1 className='page-title'>{game.title}</h1>
        <p className='meta'>{game.qid}</p>
        {game.imageUrl ? (
          <Image
            className='entity-hero'
            src={game.imageUrl}
            alt={`${game.title} cover`}
            loading='lazy'
          />
        ) : null}
        {game.description ? <p className='muted'>{game.description}</p> : null}
      </header>

      <section className='panel stack'>
        <h2 className='game-title'>Platforms</h2>
        <div className='chip-row'>
          {game.platforms.map((entry) => (
            <Link
              key={entry.platform.qid}
              className='chip chip-link'
              href={toPlatformHref(entry.platform)}
            >
              {entry.platform.name}
            </Link>
          ))}
        </div>
      </section>

      <section className='panel stack'>
        <h2 className='game-title'>Metadata tags</h2>
        <div className='chip-row'>
          {[
            ...tagGroups.genres,
            ...tagGroups.series,
            ...tagGroups.engines,
            ...tagGroups.modes,
          ].map((tag) => (
            <Link key={tag.id} className='chip chip-link' href={toTagHref(tag)}>
              {tag.label}
            </Link>
          ))}
        </div>
      </section>

      <section className='panel stack'>
        <h2 className='game-title'>Companies</h2>
        <ul className='list-reset'>
          {developers.map((entry) => (
            <li key={`${entry.companyQid}:dev`}>
              <Link
                className='text-link strong-link'
                href={`/companies/${entry.companyQid.toLowerCase()}`}
              >
                {entry.company.name}
              </Link>
              <span className='meta'> • developer</span>
            </li>
          ))}
          {publishers.map((entry) => (
            <li key={`${entry.companyQid}:pub`}>
              <Link
                className='text-link strong-link'
                href={`/companies/${entry.companyQid.toLowerCase()}`}
              >
                {entry.company.name}
              </Link>
              <span className='meta'> • publisher</span>
            </li>
          ))}
        </ul>
        {!developers.length && !publishers.length ? (
          <p className='muted'>No linked companies.</p>
        ) : null}
      </section>

      <section className='panel stack'>
        <h2 className='game-title'>Release timeline</h2>
        {game.releaseDates.length ? (
          <ul className='list-reset'>
            {game.releaseDates.map((item) => (
              <li key={item.id}>
                {item.human ?? "n/a"}
                {item.platform ? (
                  <>
                    {" "}
                    <Link
                      className='text-link strong-link'
                      href={toPlatformHref(item.platform)}
                    >
                      {item.platform.name}
                    </Link>
                  </>
                ) : null}
                {item.rank ? (
                  <span className='meta'> • {item.rank.toLowerCase()}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className='muted'>No release dates.</p>
        )}
      </section>

      <section className='panel stack'>
        <h2 className='game-title'>Controllers (via platforms)</h2>
        <div className='chip-row'>
          {compatibleControllers.map((controller) => (
            <Link
              key={controller.qid}
              className='chip chip-link'
              href={`/controllers/${controller.qid.toLowerCase()}`}
            >
              {controller.name}
            </Link>
          ))}
        </div>
        {!compatibleControllers.length ? (
          <p className='muted'>No linked controllers.</p>
        ) : null}
      </section>

      <section className='panel stack'>
        <h2 className='game-title'>Links and IDs</h2>
        <ul className='list-reset'>
          {game.websites.map((site) => (
            <li key={site.id}>
              <Link
                className='text-link strong-link'
                href={site.url}
                target='_blank'
                rel='noreferrer'
              >
                {site.category.toLowerCase()}
              </Link>
            </li>
          ))}
          {game.externalGames.map((item) => (
            <li key={item.id}>
              {item.category.toLowerCase()}
              {item.uid ? <span className='meta'> • {item.uid}</span> : null}
            </li>
          ))}
        </ul>
      </section>

      <section className='panel stack'>
        <h2 className='game-title'>Scores</h2>
        {game.scores.length ? (
          <ul className='list-reset'>
            {game.scores.map((score) => (
              <li key={score.provider}>
                {score.provider.toLowerCase()} • {score.score}
                {score.count !== null ? (
                  <span className='meta'> ({score.count})</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className='muted'>No scores available.</p>
        )}
      </section>

      <section className='panel stack'>
        <h2 className='game-title'>Game relations</h2>
        <ul className='list-reset'>
          {game.outgoingRelations.map((relation) => (
            <li key={`out:${relation.id}`}>
              <span className='meta'>{relation.kind.toLowerCase()}</span>{" "}
              <Link
                className='text-link strong-link'
                href={`/games/${relation.toGame.qid}`}
              >
                {relation.toGame.title}
              </Link>
            </li>
          ))}
          {game.incomingRelations.map((relation) => (
            <li key={`in:${relation.id}`}>
              <span className='meta'>
                incoming {relation.kind.toLowerCase()}
              </span>{" "}
              <Link
                className='text-link strong-link'
                href={`/games/${relation.fromGame.qid}`}
              >
                {relation.fromGame.title}
              </Link>
            </li>
          ))}
        </ul>
        {!game.outgoingRelations.length && !game.incomingRelations.length ? (
          <p className='muted'>No linked relations.</p>
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
                <p>{review.body ?? "No text review."}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className='muted'>No reviews yet.</p>
        )}
      </section>
    </section>
  );
}
