# Multi-Query Retrieval + Sparse Consensus Fallback

**Date:** 2026-05-25
**Status:** Approved

## Problem

The pipeline currently generates a single PubMed search query per claim. If that query is too specific or uses the wrong terminology, it returns few or no relevant papers and Stage 3 is forced to return "Insufficient Evidence" — even for well-known, well-evidenced health claims like basic hydration guidelines.

## Goal

Improve retrieval recall so that a claim which *does* have supporting literature actually finds it. For the rare cases where retrieval is genuinely sparse, allow a clearly-labelled scientific consensus note as a secondary fallback.

---

## Approach: Multi-query parallel retrieval + sparse consensus fallback

### Stage 1 — Claim extraction (changed)

`extractAndValidateClaim` in `src/lib/pipeline.ts` will return `searchQueries: string[]` (2–3 items) instead of `searchQuery: string`.

The three queries cover different retrieval angles:
- **Query 1:** Specific MeSH/clinical query (current behaviour)
- **Query 2:** Broader synonym-based query
- **Query 3:** Guideline/consensus-focused query

The Stage 1 prompt is updated to produce these three variants inside the JSON response. The return type changes accordingly; all callers are updated.

### Stage 2 — Retrieval (changed)

The API route (`src/app/api/check/route.ts`) currently calls the three source modules with one query each. It will now call each module with each query in parallel — 9 concurrent fetches (3 sources × 3 queries).

Results are merged and deduplicated by `id` (PMID for PubMed/Cochrane, WHO doc ID for IRIS). Cochrane takes precedence over PubMed for the same PMID (existing rule, unchanged).

Each PubMed/Cochrane call keeps returning 5 results per query, giving a pool of up to ~45 candidates before dedup. After dedup, the pool will typically be 10–20 distinct papers.

### Stage 3 — Assessment (changed)

Two additions to `generateVerdict` in `src/lib/pipeline.ts`:

1. **Sparse detection:** Count sources where the abstract is not `"Abstract not available."`. If fewer than 3 valid abstracts exist, set `sparseEvidence: true`.

2. **Conditional consensus instruction:** When `sparseEvidence` is true, the system prompt includes an additional instruction allowing Claude to populate an optional `consensusNote` field — but only for claims where scientific consensus is genuinely unambiguous, and clearly labelled as not from the retrieved sources.

The Claude response JSON gains:
```
"consensusNote": string | null
```

### Types (changed)

`Verdict` in `src/lib/types.ts` gains:
```typescript
consensusNote: string | null
```

### UI (changed)

`VerdictCard` in `src/components/VerdictCard.tsx` renders `consensusNote` as a distinct, visually softer section below the caveats block, labelled "Scientific consensus context" with a note that it is not from the retrieved peer-reviewed sources.

---

## Data flow

```
Stage 1: extractAndValidateClaim(userInput)
  → { isHealthClaim, extractedClaim, searchQueries: [q1, q2, q3], reason? }

Stage 2: Promise.all over 9 fetches (3 sources × 3 queries)
  → deduplicated Source[] (Cochrane precedence for same PMID)

Stage 3: generateVerdict(extractedClaim, sources)
  → sparseEvidence = sources with real abstracts < 3
  → Verdict { label, explanation, evidenceSummary, caveats, consensusNote, sources, extractedClaim }
```

---

## Error handling

No new failure modes. Each of the 9 parallel fetches is independently try/caught (existing pattern). If extra queries fail, the results from successful fetches still flow through normally.

---

## Testing

- Existing unit tests for `pubmed.ts`, `cochrane.ts`, `whoiris.ts` remain valid — the search functions are called per-query, no structural change to the modules.
- New test: deduplication logic — verify duplicate PMIDs are eliminated and Cochrane takes precedence over PubMed for the same PMID.
- The `sparseEvidence` flag threshold (3) is defined as a named constant `MIN_SOURCES_FOR_VERDICT` for easy tuning.

---

## Out of scope

- Changing the number of results returned per query (stays at 5)
- Changes to the WHO IRIS search implementation
- UI changes beyond rendering the new `consensusNote` field
