import Link from "next/link";
import { notFound } from "next/navigation";
import { TagKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toSingle } from "@/lib/validation";

const PAGE_SIZE = 40;

interface TagDetailProps {
  params: Promise<{ kind: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function parseKind(raw: string): TagKind | null {
  const normalized = raw.trim().toUpperCase();
  if (Object.values(TagKind).includes(normalized as TagKind)) {
    return normalized as TagKind;
  }
  return null;
}

function parseTagId(routeValue: string): string | null {
  const qidMatch = routeValue.match(/(q\d+)$/i);
  if (qidMatch) return qidMatch[1]?.toUpperCase() ?? null;
  if (/^q\d+$/i.test(routeValue)) return routeValue.toUpperCase();
  return null;
}

function buildHref(kind: TagKind, id: string, page: number): string {
  const slug = `${id.toLowerCase()}`;
  return `/tags/${kind.toLowerCase()}/${slug}?page=${page}`;
}

export default async function TagDetailPage({
  params,
  searchParams,
}: TagDetailProps) {
  const routeParams = await params;
  const query = await searchParams;

  const kind = parseKind(routeParams.kind);
  const id = parseTagId(routeParams.id);
  if (!kind || !id) notFound();

  const page = Math.max(
    1,
    Number.parseInt(toSingle(query.page)?.trim() ?? "1", 10) || 1,
  );
  const skip = (page - 1) * PAGE_SIZE;

  const tag = await prisma.tag.findFirst({
    where: { id, kind },
    select: { id: true, label: true, kind: true, description: true },
  });

  if (!tag) notFound();

  const [links, total] = await prisma.$transaction([
    prisma.gameTag.findMany({
      where: { tagId: tag.id },
      orderBy: [{ game: { releaseYear: "desc" } }, { game: { title: "asc" } }],
      skip,
      take: PAGE_SIZE,
      select: {
        game: {
          select: { qid: true, title: true, releaseYear: true },
        },
      },
    }),
    prisma.gameTag.count({ where: { tagId: tag.id } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className='stack'>
      <header className='panel stack'>
        <h1 className='page-title'>{tag.label}</h1>
        <p className='meta'>
          {tag.id} • {tag.kind.toLowerCase()}
        </p>
        {tag.description ? <p className='muted'>{tag.description}</p> : null}
      </header>

      <section className='panel stack'>
        <h2 className='game-title'>Games</h2>
        {links.length ? (
          <ul className='list-reset'>
            {links.map((entry) => (
              <li key={entry.game.qid}>
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
          <p className='muted'>No linked games.</p>
        )}
      </section>

      <div className='inline-actions'>
        {page <= 1 ? (
          <span className='button secondary is-disabled'>Previous</span>
        ) : (
          <Link
            className='button secondary'
            href={buildHref(tag.kind, tag.id, page - 1)}
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
            href={buildHref(tag.kind, tag.id, page + 1)}
          >
            Next
          </Link>
        )}
      </div>
    </section>
  );
}
