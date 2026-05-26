# Two-Tier Claim Classification — Design Spec

**Date:** 2026-05-26
**Status:** Approved

## Problem

The pipeline treats all health claims identically: extract → search PubMed/Cochrane/WHO → assess. This breaks for foundational biology facts like *"humans need water"* — no one publishes a paper proving basic physiology, so PubMed returns tangentially related papers, Claude correctly follows the "sources only" rule, and the user gets `"Insufficient Evidence"` for an obviously true claim.

Everyday users expect the tool to recognise basic facts, not just contested research questions.

## Goal

Classify claims at Stage 1 into two tiers and handle each with an appropriate pipeline. Research claims keep the full RAG approach. Established facts get a fast, plain-language confirmation with context — no peer-review pretence.

---

## Approach: Stage 1 classification with route branching

### Stage 1 — `extractAndValidateClaim` (changed)

Adds `claimType: 'established' | 'research'` to the return type.

Classification rules (enforced in the Stage 1 prompt):

| Type | Definition | Examples |
|------|-----------|---------|
| `established` | Foundational biology or medicine that any textbook states without a citation — not a contested research question | *"humans need water"*, *"smoking causes cancer"*, *"exercise benefits the heart"*, *"sleep is important for health"* |
| `research` | A specific claim about an intervention, dose, association, or causation that requires study evidence to verify | *"coffee prevents Alzheimer's"*, *"vitamin D cures depression"*, *"2 litres of water per day is optimal"* |

**Default to `research` when uncertain.** Contested claims (*"vaccines cause autism"*, alternative medicine claims) are always `research` so the RAG pipeline runs and can return a `"Contradicted"` verdict with sources.

The Stage 1 JSON response shape becomes:
```json
{
  "isHealthClaim": true,
  "claimType": "established" | "research",
  "extractedClaim": "...",
  "searchQueries": ["...", "...", "..."],
  "reason": "..."
}
```

`searchQueries` is still generated for all claims (including established) — it is unused for the established path but costs nothing to generate and keeps the return shape consistent.

### API route — branching (changed)

After Stage 1, the route branches on `claimType`:

```
claimType === 'established'
  → generateEstablishedVerdict(extractedClaim)
  → return verdict immediately (no search)

claimType === 'research'
  → existing pipeline: 9 parallel fetches → dedup → generateVerdict(extractedClaim, sources)
```

Established claims skip all search. This makes them ~1–2s vs ~8–12s for research claims.

**Fallback:** `generateEstablishedVerdict` is wrapped in try/catch. On failure, the route falls back to the full research pipeline so the user still gets a result.

### New function — `generateEstablishedVerdict` (new, in `pipeline.ts`)

Single Claude call. Input: `extractedClaim: string`. Output: `Verdict`.

The prompt instructs Claude to:
- Confirm or gently correct the claim using foundational scientific knowledge
- Explain *why* it is true in 2–3 plain-English sentences (no jargon)
- Add one sentence of broader biological context

Response JSON shape (Claude):
```json
{
  "label": "Established Science",
  "explanation": "2-3 plain sentences confirming the claim and explaining why it's true",
  "context": "1 sentence of broader biological context",
  "caveats": null | "string if genuinely relevant"
}
```

The function returns a `Verdict` with:
- `label: 'Established Science'`
- `explanation`, `context`, `caveats` from Claude
- `evidenceSummary: 'This is foundational science — not a contested research question.'`
- `consensusNote: null`
- `sources: []`
- `extractedClaim`

### Types (changed)

**`VerdictLabel`** (`src/lib/types.ts`):
```typescript
export type VerdictLabel =
  | 'Supported'
  | 'Contested'
  | 'Contradicted'
  | 'Insufficient Evidence'
  | 'Established Science'
```

**`Verdict`** (`src/lib/types.ts`) — add `context` field:
```typescript
export interface Verdict {
  label: VerdictLabel
  explanation: string
  evidenceSummary: string
  caveats: string | null
  consensusNote: string | null
  context: string | null        // populated for Established Science, null otherwise
  sources: Source[]
  extractedClaim: string
}
```

### UI — `VerdictCard` (changed)

**New `VERDICT_CONFIG` entry** for `'Established Science'`:
```typescript
'Established Science': {
  bg: 'bg-teal-50',
  border: 'border-teal-200',
  text: 'text-teal-800',
  dot: 'bg-teal-500',
  label: 'Established science',
  description: 'This is foundational biology or medicine — not a contested research question.',
}
```

**`context` field rendering:** When `verdict.context` is non-null, render a small note below the explanation (inside the verdict badge block):
```tsx
{verdict.context && (
  <p className="text-sm text-teal-700 mt-2 italic">{verdict.context}</p>
)}
```

**Sources section:** Hidden when `verdict.sources.length === 0` (established claims return an empty array).

### Loading state — `page.tsx` (changed)

The loading message currently hardcodes `"Searching PubMed and assessing evidence..."`. Update it to be dynamic based on a flag returned alongside the verdict — or simply show a generic message like `"Assessing claim..."` for both paths since the claimType is not known until Stage 1 completes.

Simplest approach: change the static loading text from `"Searching PubMed and assessing evidence..."` to `"Checking your claim against the evidence..."` — accurate for both paths.

---

## Data flow

```
User input
  │
  ▼
Stage 1: extractAndValidateClaim
  → { isHealthClaim, claimType, extractedClaim, searchQueries, reason }
  │
  ├─ isHealthClaim === false → reject (unchanged)
  │
  ├─ claimType === 'established'
  │     └─ generateEstablishedVerdict(extractedClaim)
  │           → Verdict { label: 'Established Science', context, sources: [] }
  │
  └─ claimType === 'research'
        └─ 9 parallel fetches → dedup → generateVerdict(extractedClaim, sources)
              → Verdict { label: Supported|Contested|Contradicted|Insufficient Evidence, ... }
```

---

## Error handling

| Failure | Behaviour |
|---------|-----------|
| Stage 1 fails to return `claimType` | Default to `'research'` (safe fallback) |
| `generateEstablishedVerdict` throws | Fall back to full research pipeline |
| Research pipeline fails | Existing error handling (unchanged) |

---

## Testing

| Test | Location |
|------|---------|
| `extractAndValidateClaim` returns `claimType: 'established'` for a basic claim | `pipeline.test.ts` |
| `extractAndValidateClaim` returns `claimType: 'research'` for a nuanced claim | `pipeline.test.ts` |
| `extractAndValidateClaim` defaults to `'research'` when field is missing from Claude response | `pipeline.test.ts` |
| `generateEstablishedVerdict` returns correct Verdict shape with empty sources | `pipeline.test.ts` |
| `generateEstablishedVerdict` sets `context` from Claude response | `pipeline.test.ts` |
| Route calls `generateEstablishedVerdict` and skips search for `established` claims | integration note (manual test) |

---

## Required change to existing `generateVerdict`

Since `context: string | null` is now a required field on `Verdict`, the existing `generateVerdict` function must return `context: null` in its return object. This is a one-line addition — no logic change.

---

## Out of scope

- Changing the research pipeline logic
- Adding citations to established verdicts
- Any changes to `sources.ts`, `pubmed.ts`, `cochrane.ts`, or `whoiris.ts`
