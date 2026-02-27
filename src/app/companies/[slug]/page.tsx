import Link from "next/link";
import { notFound } from "next/navigation";
import { CompanyRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

interface CompanyDetailProps {
  params: Promise<{ slug: string }>;
}

function parseRoute(value: string): {
  qid: string | null;
  slug: string | null;
} {
  const qidMatch = value.match(/-(q\d+)$/i);
  if (qidMatch) {
    const qid = qidMatch[1]?.toUpperCase() ?? null;
    const baseSlug = value.slice(0, value.length - qidMatch[0].length);
    return { qid, slug: baseSlug || null };
  }

  if (/^q\d+$/i.test(value)) {
    return { qid: value.toUpperCase(), slug: null };
  }

  return { qid: null, slug: value };
}

export default async function CompanyDetailPage({
  params,
}: CompanyDetailProps) {
  const route = parseRoute((await params).slug);

  const company = await prisma.company.findFirst({
    where: {
      OR: [
        ...(route.qid ? [{ qid: route.qid }] : []),
        ...(route.slug
          ? [
              {
                name: {
                  equals: route.slug.replaceAll("-", " "),
                  mode: "insensitive" as const,
                },
              },
            ]
          : []),
      ],
    },
    include: {
      games: {
        include: {
          game: { select: { qid: true, title: true, releaseYear: true } },
        },
      },
    },
  });

  if (!company) notFound();

  const developers = company.games.filter(
    (entry) => entry.role === CompanyRole.DEVELOPER,
  );
  const publishers = company.games.filter(
    (entry) => entry.role === CompanyRole.PUBLISHER,
  );

  return (
    <section className='stack'>
      <header className='panel stack'>
        <h1 className='page-title'>{company.name}</h1>
        <p className='meta'>{company.qid}</p>
        {company.description ? (
          <p className='muted'>{company.description}</p>
        ) : null}
        <div className='chip-row'>
          <span className='chip'>Developer credits: {developers.length}</span>
          <span className='chip'>Publisher credits: {publishers.length}</span>
        </div>
      </header>

      <section className='panel stack'>
        <h2 className='game-title'>Developed games</h2>
        {developers.length ? (
          <ul className='list-reset'>
            {developers.map((entry) => (
              <li key={`${entry.gameQid}:${entry.role}`}>
                <Link
                  className='text-link strong-link'
                  href={`/games/${entry.game.qid}`}
                >
                  {entry.game.title}
                </Link>
                <span className='meta'> {entry.game.releaseYear ?? "n/a"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className='muted'>No linked developer credits.</p>
        )}
      </section>

      <section className='panel stack'>
        <h2 className='game-title'>Published games</h2>
        {publishers.length ? (
          <ul className='list-reset'>
            {publishers.map((entry) => (
              <li key={`${entry.gameQid}:${entry.role}`}>
                <Link
                  className='text-link strong-link'
                  href={`/games/${entry.game.qid}`}
                >
                  {entry.game.title}
                </Link>
                <span className='meta'> {entry.game.releaseYear ?? "n/a"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className='muted'>No linked publisher credits.</p>
        )}
      </section>
    </section>
  );
}
