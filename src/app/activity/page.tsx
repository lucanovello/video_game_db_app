import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function ActivityPage() {
  const [logs, reviews, lists] = await Promise.all([
    prisma.gameLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      include: {
        user: { select: { handle: true } },
        game: { select: { qid: true, title: true } },
      },
    }),
    prisma.review.findMany({
      orderBy: { updatedAt: "desc" },
      take: 25,
      include: {
        user: { select: { handle: true } },
        game: { select: { qid: true, title: true } },
      },
    }),
    prisma.list.findMany({
      orderBy: { updatedAt: "desc" },
      take: 25,
      include: {
        user: { select: { handle: true } },
      },
    }),
  ]);

  const items = [
    ...logs.map((item) => ({
      id: `log:${item.id}`,
      createdAt: item.createdAt,
      body: (
        <>
          <Link
            className='text-link strong-link'
            href={`/u/${item.user.handle}`}
          >
            @{item.user.handle}
          </Link>{" "}
          logged{" "}
          <Link
            className='text-link strong-link'
            href={`/games/${item.game.qid}`}
          >
            {item.game.title}
          </Link>
        </>
      ),
    })),
    ...reviews.map((item) => ({
      id: `review:${item.id}`,
      createdAt: item.updatedAt,
      body: (
        <>
          <Link
            className='text-link strong-link'
            href={`/u/${item.user.handle}`}
          >
            @{item.user.handle}
          </Link>{" "}
          reviewed{" "}
          <Link
            className='text-link strong-link'
            href={`/games/${item.game.qid}`}
          >
            {item.game.title}
          </Link>
          {item.rating !== null ? ` • ${item.rating}/10` : ""}
        </>
      ),
    })),
    ...lists.map((item) => ({
      id: `list:${item.id}`,
      createdAt: item.updatedAt,
      body: (
        <>
          <Link
            className='text-link strong-link'
            href={`/u/${item.user.handle}`}
          >
            @{item.user.handle}
          </Link>{" "}
          updated list <span className='strong-link'>{item.name}</span>
        </>
      ),
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <section className='stack'>
      <header className='stack'>
        <h1 className='page-title'>Activity</h1>
        <p className='muted'>
          Recent logs, reviews, and list updates across users.
        </p>
      </header>

      <section className='panel stack'>
        {items.length ? (
          <ul className='list-reset'>
            {items.map((item) => (
              <li key={item.id} className='review-item stack'>
                <p>{item.body}</p>
                <p className='meta'>
                  {item.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className='muted'>No activity yet.</p>
        )}
      </section>
    </section>
  );
}
