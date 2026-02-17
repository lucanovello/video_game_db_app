import Link from "next/link";
import { prisma } from "@/lib/prisma";

interface UserProfilePageProps {
  params: Promise<{ handle: string }>;
}

export default async function UserProfilePage({ params }: UserProfilePageProps) {
  const { handle } = await params;
  const normalizedHandle = handle.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { handle: normalizedHandle },
    include: {
      logs: {
        orderBy: { createdAt: "desc" },
        take: 25,
        include: {
          game: {
            select: { qid: true, title: true },
          },
        },
      },
      reviews: {
        orderBy: { createdAt: "desc" },
        take: 25,
        include: {
          game: {
            select: { qid: true, title: true },
          },
        },
      },
      lists: {
        orderBy: { updatedAt: "desc" },
        include: {
          items: {
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
            include: {
              game: {
                select: { qid: true, title: true },
              },
            },
          },
        },
      },
    },
  });

  if (!user) {
    return (
      <section className="stack">
        <h1 className="page-title">@{normalizedHandle}</h1>
        <p className="muted">
          No profile yet. Submit a log or review from a game page using this handle to create it.
        </p>
        <Link className="button" href="/games">
          Browse games
        </Link>
      </section>
    );
  }

  return (
    <section className="stack">
      <header className="stack">
        <h1 className="page-title">@{user.handle}</h1>
        <p className="muted">
          Logs: {user.logs.length} • Reviews: {user.reviews.length} • Lists: {user.lists.length}
        </p>
      </header>

      <div className="two-col">
        <div className="stack">
          <section className="panel stack">
            <h2 className="game-title">Recent Logs</h2>
            {user.logs.length ? (
              <ul className="list-reset">
                {user.logs.map((log) => (
                  <li key={log.id} className="review-item stack">
                    <Link href={`/games/${log.game.qid}`}>{log.game.title}</Link>
                    <p className="meta">
                      {log.playedOn ? log.playedOn.toISOString().slice(0, 10) : "No date"}
                    </p>
                    {log.notes ? <p>{log.notes}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No logs yet.</p>
            )}
          </section>

          <section className="panel stack">
            <h2 className="game-title">Recent Reviews</h2>
            {user.reviews.length ? (
              <ul className="list-reset">
                {user.reviews.map((review) => (
                  <li key={review.id} className="review-item stack">
                    <Link href={`/games/${review.game.qid}`}>{review.game.title}</Link>
                    <p className="meta">{review.rating !== null ? `${review.rating}/10` : "No rating"}</p>
                    {review.body ? <p>{review.body}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No reviews yet.</p>
            )}
          </section>
        </div>

        <aside className="stack">
          <form className="panel stack" action="/api/lists" method="post">
            <h2 className="game-title">Create List</h2>
            <input type="hidden" name="handle" value={user.handle} />
            <input type="hidden" name="redirectTo" value={`/u/${user.handle}`} />

            <label className="field">
              Name
              <input className="input" name="name" required />
            </label>
            <label className="field">
              Description
              <textarea className="textarea" name="description" />
            </label>
            <button className="button" type="submit">
              Create list
            </button>
          </form>

          {user.lists.map((list) => (
            <section key={list.id} className="panel stack">
              <h2 className="game-title">{list.name}</h2>
              {list.description ? <p className="muted">{list.description}</p> : null}

              {list.items.length ? (
                <ul className="list-reset">
                  {list.items.map((item) => (
                    <li key={item.gameQid} className="review-item stack">
                      <Link href={`/games/${item.game.qid}`}>{item.game.title}</Link>
                      <p className="meta">Position: {item.position}</p>
                      {item.note ? <p>{item.note}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No items yet.</p>
              )}

              <hr className="divider" />

              <form action={`/api/lists/${list.id}/items`} method="post" className="stack">
                <input type="hidden" name="handle" value={user.handle} />
                <input type="hidden" name="redirectTo" value={`/u/${user.handle}`} />
                <label className="field">
                  Game QID
                  <input className="input" name="gameQid" placeholder="Q12345" required />
                </label>
                <label className="field">
                  Position
                  <input className="input" type="number" name="position" min={0} />
                </label>
                <label className="field">
                  Note
                  <input className="input" name="note" />
                </label>
                <button className="button secondary" type="submit">
                  Add / update item
                </button>
              </form>
            </section>
          ))}
        </aside>
      </div>
    </section>
  );
}
