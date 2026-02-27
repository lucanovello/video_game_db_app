# ADR 0001: Ingestion source-of-truth assumptions (v2)

Date: 2026-02-25
Status: Accepted (revisable)

## Context

The repo currently has overlapping ingest paths (`wd:etl`, `wd:hydrate-games`, membership hydration scripts) and multiple roster sources (WDQS platform memberships and WikiProject-derived roster extraction).

To keep implementation incremental and low-risk, we need explicit assumptions for the first implementation phase.

## Decision

1. Canonical execution entrypoint is `npm run wd:etl`.
2. Membership truth is hybrid:
   - WDQS (`P31=video game` + `P400=platform`) is the structured baseline ingest.
   - WikiProject roster pages are curated supplemental evidence and coverage targets.
3. Relationship provenance must remain explicit in rows (`source`, and where available `claimId` / `claimJson`).
4. Controller modeling is platform-first for now:
   - Introduce controller entities and platform compatibility before attempting direct game↔controller links.
5. Rating normalization is provider-scoped:
   - Migrate reads to `GameScore` before dropping duplicated scalar rating fields on `Game`.

## Consequences

- Ingestion reports should track overlap and deltas between WDQS-derived membership and WikiProject-derived membership.
- Pipeline convergence work should remove duplicated mapping/parsing logic in favor of one claim mapping source (`scripts/wikidata/propertyRegistry.ts`).
- Future direct game↔controller support can be added only after measurable Wikidata coverage supports it.

## Follow-up checks

- Revisit this ADR once claim-mapping and release qualifier handling are fully unified.
- Update if roster quality analysis shows a different source precedence is needed per platform family.
