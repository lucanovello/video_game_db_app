import Link from "next/link";
import { TagKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function formatTagKind(kind: TagKind): string {
  return kind
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toTagHref(tag: { kind: TagKind; id: string; label: string }): string {
  const labelSlug = tag.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `/tags/${tag.kind.toLowerCase()}/${labelSlug}-${tag.id.toLowerCase()}`;
}

export default async function TagsPage() {
  const [tags, kindCounts] = await Promise.all([
    prisma.tag.findMany({
      orderBy: [{ updatedAt: "desc" }],
      take: 40,
      select: {
        id: true,
        kind: true,
        label: true,
        _count: { select: { games: true } },
      },
    }),
    Promise.all(
      Object.values(TagKind).map(async (kind) => ({
        kind,
        count: await prisma.tag.count({ where: { kind } }),
      })),
    ),
  ]);

  return (
    <section className='stack'>
      <header className='stack'>
        <h1 className='page-title'>Tags</h1>
        <p className='muted'>
          Browse genre/theme/engine/mode and related taxonomy tags.
        </p>
      </header>

      <section className='panel stack'>
        <h2 className='game-title'>Kinds</h2>
        <div className='chip-row'>
          {kindCounts.map((row) => (
            <span key={row.kind} className='chip'>
              {formatTagKind(row.kind)}: {row.count}
            </span>
          ))}
        </div>
      </section>

      <section className='panel stack'>
        <h2 className='game-title'>Recently updated tags</h2>
        <ul className='list-reset'>
          {tags.map((tag) => (
            <li key={tag.id}>
              <Link className='text-link strong-link' href={toTagHref(tag)}>
                {tag.label}
              </Link>
              <span className='meta'>
                {" "}
                ({formatTagKind(tag.kind)}) • games: {tag._count.games}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
