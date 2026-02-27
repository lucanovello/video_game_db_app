import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

interface ControllerDetailProps {
  params: Promise<{ slug: string }>;
}

function parseRoute(value: string): string | null {
  const qidMatch = value.match(/(q\d+)$/i);
  return qidMatch?.[1]?.toUpperCase() ?? null;
}

function toPlatformHref(platform: {
  slug: string | null;
  qid: string;
}): string {
  const suffix = platform.qid.toLowerCase();
  return platform.slug
    ? `/platforms/${platform.slug}-${suffix}`
    : `/platforms/${suffix}`;
}

export default async function ControllerDetailPage({
  params,
}: ControllerDetailProps) {
  const qid = parseRoute((await params).slug);
  if (!qid) notFound();

  const controller = await prisma.controller.findUnique({
    where: { qid },
    include: {
      platforms: {
        include: {
          platform: {
            select: {
              qid: true,
              slug: true,
              name: true,
              releaseYear: true,
              type: true,
            },
          },
        },
      },
    },
  });

  if (!controller) notFound();

  return (
    <section className='stack'>
      <header className='panel stack'>
        <h1 className='page-title'>{controller.name}</h1>
        <p className='meta'>{controller.qid}</p>
        {controller.description ? (
          <p className='muted'>{controller.description}</p>
        ) : null}
      </header>

      <section className='panel stack'>
        <h2 className='game-title'>Compatible platforms</h2>
        {controller.platforms.length ? (
          <ul className='list-reset'>
            {controller.platforms.map((entry) => (
              <li key={entry.platformQid}>
                <Link
                  className='text-link strong-link'
                  href={toPlatformHref(entry.platform)}
                >
                  {entry.platform.name}
                </Link>
                <span className='meta'>
                  {" "}
                  {entry.platform.releaseYear ?? "n/a"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className='muted'>No linked platforms.</p>
        )}
      </section>
    </section>
  );
}
