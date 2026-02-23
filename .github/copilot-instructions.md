# Copilot Instructions — Video Game DB (Wikidata/Wikipedia ingestion)

## Project goal

Build a “Letterboxd for video games” database + web app. The core technical objective is a **repeatable, idempotent ingestion pipeline** that:

1. discovers rosters (games per platform),
2. caches raw upstream responses,
3. parses into a normalized Postgres schema,
4. generates coverage/QA reports.

This repo uses **Next.js + TypeScript + Prisma + Postgres** and a set of Node scripts under `scripts/` for ingestion.

---

## Guiding principles (non-negotiable)

- **Idempotent scripts:** running the same script twice should not duplicate rows or corrupt data.
- **Cache first:** never refetch upstream data if you already have the same version cached.
- **Two-layer data model:**
  - **Raw cache layer**: store fetched page/entity payloads (JSON/text) + version markers.
  - **Parsed layer**: store normalized entities used by the app (Game, Platform, etc.).
- **Provenance-aware:** every parsed record should be traceable back to a cache entry (page/entity) that produced it.
- **Small, testable steps:** implement ingestion in discrete scripts with clear inputs/outputs.
- **Fail gracefully:** partial progress is acceptable; scripts should resume/retry rather than restart from scratch.

---

## Repo conventions

### TypeScript / Node

- Prefer TypeScript for scripts (`scripts/**/*.ts`).
- Avoid large framework dependencies in ingestion scripts; keep them lean.
- Use a single, reusable HTTP client helper for upstream calls.

### Prisma / Postgres

- Use Prisma migrations for schema changes.
- Prefer `Json`/JSONB for raw payload storage in cache tables.
- Add **unique constraints** and **indexes** to enforce idempotency and performance.

### Logging

- Scripts must log:
  - counts (fetched, cached hit, parsed, upserted)
  - timings (start/end)
  - any “skipped because unchanged” behavior
- Errors should include enough context to debug (platform id, page title, QID).

---

## Data ingestion architecture (how to think about it)

### 1) Raw cache layer (source documents)

Cache upstream responses so we can re-parse without re-downloading and can debug issues later.

**Cache rules**

- “Version marker” determines if a fetch is needed:
  - Wiki pages: store revision id (a version number).
  - Wikidata entities: store last revision id (a version number).
- If version marker unchanged → **skip network** and use cached payload.

### 2) Parsed layer (normalized domain tables)

Parsers read from cache tables and write to app tables. Parsers must be deterministic and re-runnable.

---

## Upstream calls (keep it simple)

We interact with:

- Wikipedia API endpoint (`en.wikipedia.org/...`) for list pages + game pages.
- Wikidata API endpoint (`wikidata.org/...`) for curated project pages and entity hydration.

**Implementation approach**

- Create a single module like `scripts/wiki/wikiClient.ts`:
  - build request URLs with query params
  - `fetch()` JSON/text
  - retry with backoff on transient failures
  - concurrency limiting (simple queue)
- All scripts should reuse this client; do not duplicate request logic.

---

## Script design standards

### Script contract

Every script should clearly define:

- **Inputs** (DB tables, env vars, optional CLI args)
- **Outputs** (DB tables updated, files written, logs printed)
- **Idempotency behavior** (unique keys, upserts, skip rules)

### Script naming

Use verbs:

- `fetch*` = downloads + caches only
- `parse*` = reads cached data, extracts items, writes parsed tables
- `ingest*` = does multiple stages end-to-end
- `report*` = outputs coverage/QA metrics

### Recommended structure

- `scripts/wiki/` — Wikipedia/Wikidata page fetch + parsing helpers
- `scripts/wikidata/` — entity hydration + entity parsing
- `scripts/reports/` — coverage reports and QA utilities
- `scripts/lib/` — shared utilities (db, logging, concurrency, CLI args)

---

## DB patterns Copilot should follow

### Use database constraints to enforce correctness

- Prefer `@@unique([...])` constraints for membership tables.
- Prefer `upsert` / `createMany({ skipDuplicates: true })` patterns.
- Add indexes on:
  - foreign keys
  - frequently filtered columns (platformQid, gameQid, title)
  - version markers (revid/lastrevid) if used in queries

### Prefer “latest snapshot” caching unless explicitly asked for history

Default is: one cache row per (site, title) or per QID, updated when version changes.
Only store full revision history if a specific need is identified.

---

## Coverage / QA reporting (must-have)

Provide scripts that output:

- total games per platform
- % with release date
- % with genre
- % with developer/publisher
- sample lists of missing-field games to guide improvements

Reports should be fast and not require network.

---

## Safety / hygiene

- Never hardcode secrets. Read from `.env` / environment variables.
- Avoid aggressive concurrency. Be polite to upstream services.
- Don’t introduce heavy parsing dependencies unless clearly justified.

---

## How Copilot should work on tasks

1. **Start by summarizing the plan** for the change (files to edit, new scripts/models).
2. Make schema changes first (Prisma), then implement scripts, then add a minimal report/test.
3. Keep PR-sized diffs: no massive refactors unless requested.
4. If uncertain about an existing convention, search the codebase and match it.

---

## Definition of done for any ingestion feature

- Schema + migration is added (if needed).
- Script is idempotent and logs meaningful counts.
- Cache skip logic is implemented (no refetch when unchanged).
- A report or quick query verifies output quality.
- Re-running scripts produces the same final DB state.
