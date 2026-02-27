import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toSingle } from "@/lib/validation";

const PAGE_SIZE = 30;

interface CompaniesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function buildHref(params: { q: string; page: number }): string {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  query.set("page", String(params.page));
  return `/companies?${query.toString()}`;
}

function toCompanyHref(company: { qid: string; name: string }): string {
  const slug = company.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `/companies/${slug}-${company.qid.toLowerCase()}`;
}

export default async function CompaniesPage({
  searchParams,
}: CompaniesPageProps) {
  const params = await searchParams;
  const q = toSingle(params.q)?.trim() ?? "";
  const pageRaw = toSingle(params.page)?.trim() ?? "1";
  const page = Math.max(1, Number.parseInt(pageRaw, 10) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const where: Prisma.CompanyWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};

  const [companies, total] = await prisma.$transaction([
    prisma.company.findMany({
      where,
      orderBy: [{ name: "asc" }],
      skip,
      take: PAGE_SIZE,
      select: {
        qid: true,
        name: true,
        description: true,
        _count: { select: { games: true } },
      },
    }),
    prisma.company.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className='stack'>
      <header className='stack'>
        <h1 className='page-title'>Companies</h1>
        <p className='muted'>
          Browse developers and publishers linked from Wikidata claims.
        </p>
      </header>

      <form className='panel search-grid' action='/companies' method='get'>
        <label className='field'>
          Search
          <input
            className='input'
            name='q'
            defaultValue={q}
            placeholder='Nintendo, Capcom...'
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
        Showing {companies.length} of {total} companies
      </p>

      <div className='games-grid'>
        {companies.map((company) => (
          <Link
            key={company.qid}
            className='game-card'
            href={toCompanyHref(company)}
          >
            <h2 className='game-title'>{company.name}</h2>
            <p className='meta'>{company.qid}</p>
            {company.description ? (
              <p className='meta'>{company.description}</p>
            ) : null}
            <div className='chip-row'>
              <span className='chip'>Linked games: {company._count.games}</span>
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
