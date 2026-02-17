# video-game-db-app

video-game-db-app is a Next.js + TypeScript + Prisma + Postgres app for a social video game experience.

MVP scope:

- Console-first game catalog from Wikidata (WDQS + wbgetentities)
- Social layer: logs, reviews, and lists
- Resumable ETL with per-platform cursor paging
- QIDs as primary keys for catalog entities

## Requirements

- Node 20+
- Postgres
- npm

## Setup

```bash
npm install
npm run prisma:generate
npm run db:migrate
```

Then start the app:

```bash
npm run dev
```

## Environment Variables

Required:

- `DATABASE_URL` Postgres connection string
- `WIKIDATA_USER_AGENT` descriptive user agent with contact info

Optional ETL tuning:

- `WDQS_PAGE_SIZE` default `2000` (guarded: must be >= `200`)
- `WDQS_MIN_INTERVAL_MS` default `250`
- `WDQS_MIN_DELAY_MS` default `0`
- `WDQS_MAX_DELAY_MS` default `250`
- `MAX_RETRIES` default `6`
- `MAJOR_PLATFORM_TOP_N` default `25`
- `MAJOR_PLATFORM_MIN_SITELINKS` default `8`
- `MAJOR_PLATFORM_INCLUDE_QIDS` comma-separated QIDs always marked major
- `FETCH_PLATFORM_LIMIT` limit how many major platforms to process in one run
- `ENRICH_BATCH_SIZE` default `50`
- `ENRICH_CONCURRENCY` default `3`
- `ENRICH_MAX_GAMES` cap enrich volume per run

Example `.env`:

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/video-game-db-app?schema=public"
WIKIDATA_USER_AGENT="video-game-db-app/0.1 (contact: https://github.com/your-handle)"
WDQS_PAGE_SIZE=2000
WDQS_MIN_INTERVAL_MS=250
WDQS_MIN_DELAY_MS=0
WDQS_MAX_DELAY_MS=250
MAX_RETRIES=6
MAJOR_PLATFORM_TOP_N=25
MAJOR_PLATFORM_MIN_SITELINKS=8
ENRICH_BATCH_SIZE=50
ENRICH_CONCURRENCY=3
```

## ETL Commands

Docs:

- IGDB reference notes: `docs/igdb-api-notes.md`

Run the full console-first pipeline:

```bash
npm run wd:etl
```

Or run step-by-step:

```bash
npm run wd:platforms
npm run wd:platforms:backfill
npm run wd:platforms:enrich
npm run wd:platforms:major
npm run wd:platforms:groupings
npm run wd:games
npm run wd:enrich
npm run wd:scores
npm run wd:coverage > platform-coverage.csv
```

Useful variants:

```bash
npm run wd:games:reset   # reset major-platform cursors, then fetch from start
npm run wd:platforms:enrich:all # enrich all platforms, not only incomplete ones
npm run wd:enrich:all    # enrich all games, not only unenriched ones
npm run wd:scores        # recompute internal score snapshots from reviews
npm run wd:cleanup       # flag obvious junk (missing labels/entities) for hiding
```

After schema changes that add new derived fields (e.g. Wikipedia sitelinks), run:

```bash
npm run wd:enrich:all
npm run wd:cleanup
```

## ETL behavior

- WDQS requests are throttled and retried with exponential backoff.
- `Retry-After` is honored for 429/5xx responses.
- `fetchGamesByPlatform` stores cursor state in `Platform.gamesCursorQid`, so reruns resume per platform.
- PC/Windows-wide ingestion is intentionally out of scope for this MVP.
