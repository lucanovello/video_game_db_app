import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toSingle } from "@/lib/validation";

const PAGE_SIZE = 30;

interface ControllersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function buildHref(params: { q: string; page: number }): string {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  query.set("page", String(params.page));
  return `/controllers?${query.toString()}`;
}

function toControllerHref(controller: { qid: string; name: string }): string {
  const slug = controller.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `/controllers/${slug}-${controller.qid.toLowerCase()}`;
}

export default async function ControllersPage({
  searchParams,
}: ControllersPageProps) {
  const params = await searchParams;
  const q = toSingle(params.q)?.trim() ?? "";
  const pageRaw = toSingle(params.page)?.trim() ?? "1";
  const page = Math.max(1, Number.parseInt(pageRaw, 10) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const where: Prisma.ControllerWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};

  const [controllers, total] = await prisma.$transaction([
    prisma.controller.findMany({
      where,
      orderBy: [{ name: "asc" }],
      skip,
      take: PAGE_SIZE,
      select: {
        qid: true,
        name: true,
        description: true,
        _count: { select: { platforms: true } },
      },
    }),
    prisma.controller.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className='stack'>
      <header className='stack'>
        <h1 className='page-title'>Controllers</h1>
        <p className='muted'>
          Browse input devices linked to platforms via Wikidata.
        </p>
      </header>

      <form className='panel search-grid' action='/controllers' method='get'>
        <label className='field'>
          Search
          <input
            className='input'
            name='q'
            defaultValue={q}
            placeholder='DualShock, Joy-Con...'
          />
        </label>
        <div className='field'>
          <span>Run query</span>
          <button className='button' type='submit'>
            Search
          </button>
        </div>
      </form>

      <p className='muted'>
        Showing {controllers.length} of {total} controllers
      </p>

      <div className='games-grid'>
        {controllers.map((controller) => (
          <Link
            key={controller.qid}
            className='game-card'
            href={toControllerHref(controller)}
          >
            <h2 className='game-title'>{controller.name}</h2>
            <p className='meta'>{controller.qid}</p>
            {controller.description ? (
              <p className='meta'>{controller.description}</p>
            ) : null}
            <div className='chip-row'>
              <span className='chip'>
                Platforms: {controller._count.platforms}
              </span>
            </div>
          </Link>
        ))}
      </div>

      <div className='inline-actions'>
        {page <= 1 ? (
          <span className='button secondary is-disabled'>Previous</span>
        ) : (
          <Link
            className='button secondary'
            href={buildHref({ q, page: page - 1 })}
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
            href={buildHref({ q, page: page + 1 })}
          >
            Next
          </Link>
        )}
      </div>
    </section>
  );
}
