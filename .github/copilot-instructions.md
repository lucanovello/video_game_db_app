# Copilot Instructions — video-game-db-app

## Project summary

This repo is a **Next.js (App Router) + TypeScript + Prisma + Postgres** app for a **Letterboxd-like social video game database**.
It has two pillars:

1. **Catalog/ETL**: ingest + normalize video game metadata from **Wikidata** (WDQS + entity hydration)
2. **Social**: users can log, review, and list games

## Non-negotiable data principles

- **Never invent data.** If Wikidata doesn’t provide a field, store `null` and rely on **coverage reporting**.
- **QIDs are primary keys** for catalog entities (games/platforms/companies/tags/etc). Prefer relations + join tables over strings.
- **Keep provenance**: when adding/deriving data, store `source` and (when available) `claimId`/`claimJson`.

## Canonical ingestion architecture

- **One source of truth for claim→field mapping:** `scripts/wikidata/propertyRegistry.ts`.
  - If you add a new field/table derived from claims, you must update:
    - `propertyRegistry.ts` (mapping + parser)
    - `wd:hydrate-games` logic (if needed)
    - coverage/reports if relevant
- **Always use the entity cache** (revision-aware) for Wikidata entity hydration to avoid refetching and rate-limit issues.
- **Release dates must respect Wikidata ranks + qualifiers** (platform/region/precision). Normalize into `ReleaseDate` rows and derive `Game.firstReleaseAt` + `Game.releaseYear` deterministically.
- Keep ETL **idempotent**:
  - Safe to rerun; prefer `upsert`/`connectOrCreate`
  - Store cursors/checkpoints in DB (e.g., platform cursor fields)
  - Avoid destructive truncation unless explicitly requested by a script flag

## External references (use as guidance, not as truth)

- Wikidata WikiProject Video games pages guide roster/coverage expectations.
- IGDB endpoints are a **schema inspiration checklist** (entity types + relationships). Do **not** copy IGDB business-logic fields (IGDB ratings/hypes/etc). Prefer neutral, provider-based score tables.

## Schema/DB rules

- Prefer **normalized tables** for: Platforms, Companies, Tags (genres/themes/engines/modes/etc), ReleaseDates, Websites, External IDs, Media.
- Do not duplicate “ratings” on `Game` if they already exist in `GameScore`. Keep scoring in provider-scoped tables.
- Index for real queries:
  - `Game(releaseYear)`, `Game(firstReleaseAt)`, `Game(updatedAt)`
  - join tables on both FKs
  - `Tag(kind,label)` and `Company(name)`
- Avoid breaking migrations. If schema changes are big, ship in small steps:
  1. additive tables/fields
  2. backfill script
  3. switch reads
  4. remove old fields

## Frontend rules (Letterboxd-for-games UX)

- App Router. Prefer **Server Components** and server-side Prisma queries; client components only when interactive.
- No Prisma usage in client components.
- Pages must be relationship-first and linkable:
  - Games → Platforms / Companies / Tags / ReleaseDates / Media / Websites / External IDs
  - Platforms → Games on platform + platform metadata
  - Companies → Developed/Published/etc games
  - Tags → Games by tag kind
  - Users → Logs / Reviews / Lists
- Prefer **cursor pagination** for large lists (avoid deep offset pagination).
- Keep UI consistent and simple; prioritize browse + search + filters.

## Coding conventions

- TypeScript: keep types explicit at boundaries (API/ETL parsing); validate unknown JSON before use.
- ETL: handle network errors robustly; honor `Retry-After`; use bounded concurrency.
- Keep changes small and reviewable; avoid sweeping refactors unless asked.

## Commands (canonical)

- Setup:
  - `npm install`
  - `npm run prisma:generate`
  - `npm run db:migrate`
- Dev: `npm run dev`
- Full ingest pipeline: `npm run wd:etl`
- Property coverage + hydration workflow:
  - `npm run wd:analyze-props`
  - update `scripts/wikidata/propertyRegistry.ts`
  - `npm run wd:hydrate-prop-meta`
  - `npm run wd:hydrate-games`

## Agent workflow (when making repo changes)

- For large tasks: **plan first** (files touched, migration/backfill, acceptance criteria).
- Implement one todo at a time, run relevant scripts/checks, and leave clear notes in the PR/commit message.
