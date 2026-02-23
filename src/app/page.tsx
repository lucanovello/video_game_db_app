import Link from "next/link";

export default function HomePage() {
  return (
    <section className='stack'>
      <header className='stack'>
        <h1 className='page-title'>
          Track what you played. Review what mattered.
        </h1>
        <p className='muted'>
          video-game-db-app is a console-first game catalog sourced from
          Wikidata with a lightweight social layer.
        </p>
      </header>

      <div className='home-grid'>
        <Link className='panel stack' href='/games'>
          <h2 className='game-title'>Browse Games</h2>
          <p className='muted'>
            Search by title, filter by platform/year, and open detail pages with
            logs and reviews.
          </p>
          <span className='chip'>/games</span>
        </Link>

        <Link className='panel stack' href='/platforms'>
          <h2 className='game-title'>Browse Platforms</h2>
          <p className='muted'>
            Search platforms and open a detail page with metadata plus all
            linked games.
          </p>
          <span className='chip'>/platforms</span>
        </Link>

        <Link className='panel stack' href='/u/demo_user'>
          <h2 className='game-title'>Open a Profile</h2>
          <p className='muted'>
            See recent logs, reviews, and lists. Start with the demo profile
            route.
          </p>
          <span className='chip'>/u/demo_user</span>
        </Link>
      </div>
    </section>
  );
}
