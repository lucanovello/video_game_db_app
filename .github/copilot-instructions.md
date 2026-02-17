## Project: video-game-db-app (Video Game Hub)

video-game-db-app is a Next.js (App Router) + TypeScript + Prisma + Postgres web app. It combines:

1. A **catalog** of video games sourced from **Wikidata** (WDQS + wbgetentities).
2. A **social layer**: users log plays, rate/review games, and create lists.

The catalog ingest is designed to be **rerunnable**, **resumable**, and **polite to WDQS** (throttled, retry/backoff, small queries).

---

## High-level goals

### Catalog (Phase 1)

- Ingest **console-first** game catalog using WDQS by platform (console platforms are cleaner than Windows/PC).
- Store game QIDs with enough metadata to browse: title, description, image, release year, platforms.
- Keep raw WD claims JSON for future expansion.

### Social layer (Phase 1)

- Minimal auth or stubbed user (can implement real auth later).
- Users can:
  - log a game (playedOn + notes)
  - write a review (rating + body)
  - make lists (add games in order)

### Non-goals (for MVP)

- Do NOT attempt “all video games ever” from WD dumps.
- Do NOT ingest PC/Windows shovelware during console MVP.
- Do NOT build a perfect moderation system or full recommendation engine.

---

## Data sources

- WDQS (SPARQL) for roster discovery:
  - Console platforms: instance/subclass of `video game console (Q8076)`
  - Games: instance of `video game (Q7889)` and platform `P400`
- Wikidata API `wbgetentities` for hydration:
  - labels/descriptions
  - claims (release date, genre, etc.)
  - sitelinks (Wikipedia presence signal)

Respect WDQS etiquette:

- Always send a descriptive User-Agent (env var).
- Throttle concurrency.
- Retry on 429/5xx with backoff and honor Retry-After.

---

## Expected architecture

### App

- Next.js App Router
- Server components for data fetch where possible
- Route handlers for mutations (logs/reviews/lists)
- Prisma for DB access

### Scripts (ETL)

All Wikidata scripts live under `scripts/wikidata/` and should be runnable via `tsx`.

Pipeline order:

1. `seedPlatforms.ts` — load console platforms
2. `setMajorPlatforms.ts` — mark “major consoles” (e.g., by sitelinks or curated list)
3. `fetchGamesByPlatform.ts` — roster games per platform with cursor paging; upsert Game + join table
4. `enrichGames.ts` — hydrate game details and related entities (genres/companies/etc.)

Design principles for ETL scripts:

- Idempotent: safe to re-run without creating duplicates
- Resumable: persist cursor per platform
- Batch DB writes where possible (avoid per-row upsert in huge loops)
- Keep queries narrow (per platform) to avoid WDQS timeouts

---

## Prisma expectations

- QIDs are primary keys for catalog entities (Game.qid, Platform.qid, Company.qid, Tag.id)
- Social entities reference Game.qid
- Prefer join tables (GamePlatform, GameTag, GameCompany) over arrays for queryability

---

## Code conventions

- TypeScript strict mode; avoid `any`.
- Keep domain parsing isolated:
  - `scripts/wikidata/claims/` can host claim-extractor helpers.
- Use small, testable functions:
  - `extractReleaseYear(claims)`
  - `extractImageCommons(claims)`
  - `extractGenres(claims)` etc.
- Prefer “labels-only” calls for related entity label resolution where possible to reduce payload:
  - Add `wbGetEntitiesLabels(ids)` vs `wbGetEntitiesFull(ids)`.

---

## WDQS / API throttling requirements

- Centralize HTTP logic in `http.ts` with:
  - retry/backoff with jitter
  - respect Retry-After
- Limit concurrency with `p-limit` for:
  - WDQS requests
  - wbgetentities batches
- Avoid giant SPARQL joins; prefer multiple smaller calls.

---

## Routes / UI (MVP)

### Pages

- `/games` — browse/search games (filter by platform, year)
- `/games/[qid]` — game detail + reviews + “log” action
- `/u/[handle]` — profile: logs, reviews, lists

### API route handlers (MVP)

- `GET /api/games?q=&platform=&page=`
- `GET /api/games/[qid]`
- `POST /api/logs`
- `POST /api/reviews`
- `POST /api/lists` and `POST /api/lists/[id]/items`

---

## Development workflow checklist

1. Ensure Postgres is running and `DATABASE_URL` works.
2. Run `prisma migrate dev`.
3. Run ETL scripts in order (console-first).
4. Build basic browsing UI.
5. Add social features.
6. Only after MVP: add PC ingestion with strict quality gates.

---

## PC ingestion (later)

When adding Windows/PC:

- Do NOT ingest everything with platform = Windows.
- Require at least one strong external anchor OR Wikipedia sitelink.
- Implement as separate script `fetchPcGames.ts` and mark those sources separately.

---

## If unsure

Default behavior:

- Keep console ingestion conservative but complete (store, then score/flag).
- Don’t prematurely delete catalog entries; use `isJunk` + `junkReason` flags.

End.
