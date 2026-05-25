# Multi-Query Retrieval + Sparse Consensus Fallback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace single-query PubMed/Cochrane/WHO retrieval with 3-query parallel retrieval, and add a clearly-labelled scientific consensus note when retrieved sources are sparse.

**Architecture:** Stage 1 now returns 3 search queries (specific MeSH, broader synonym, guideline-focused). Stage 2 fans out to 9 parallel fetches (3 sources × 3 queries) and deduplicates by ID with Cochrane taking precedence. Stage 3 detects sparse evidence (<3 valid abstracts) and conditionally permits a `consensusNote` field in the Claude response.

**Tech Stack:** Next.js 14 API routes, `@anthropic-ai/sdk`, Vitest, TypeScript strict mode.

---

### Task 1: Add `consensusNote` to the `Verdict` type

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Update the `Verdict` interface**

Replace the existing `Verdict` interface in `src/lib/types.ts`:

```typescript
export interface Verdict {
  label: VerdictLabel
  explanation: string
  evidenceSummary: string
  caveats: string | null
  consensusNote: string | null
  sources: Source[]
  extractedClaim: string
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: TypeScript errors in `pipeline.ts` and `VerdictCard.tsx` because `consensusNote` is now required but not yet returned or rendered. This is expected — subsequent tasks fix them. If the only errors are about `consensusNote`, proceed.

---

### Task 2: Extract and test the deduplication helper

**Files:**
- Create: `src/lib/sources.ts`
- Create: `src/lib/__tests__/sources.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/sources.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { deduplicateSources } from '../sources'
import type { Source } from '../types'

function makeSource(id: string, sourceLabel: Source['source']): Source {
  return {
    id,
    title: `Title ${id}`,
    authors: [],
    journal: 'Test Journal',
    year: 2020,
    abstract: 'Some abstract text.',
    url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
    source: sourceLabel,
    evidenceTier: 'Unknown',
  }
}

describe('deduplicateSources', () => {
  it('keeps all sources when there are no duplicate IDs', () => {
    const sources = [makeSource('1', 'PubMed'), makeSource('2', 'Cochrane'), makeSource('3', 'WHO')]
    expect(deduplicateSources(sources)).toHaveLength(3)
  })

  it('removes the second occurrence of a duplicate ID', () => {
    const sources = [
      makeSource('42', 'Cochrane'),
      makeSource('42', 'PubMed'),
    ]
    const result = deduplicateSources(sources)
    expect(result).toHaveLength(1)
    expect(result[0].source).toBe('Cochrane')
  })

  it('gives Cochrane precedence over PubMed for the same PMID when Cochrane appears first', () => {
    const sources = [
      makeSource('10', 'Cochrane'),
      makeSource('10', 'PubMed'),
      makeSource('11', 'PubMed'),
    ]
    const result = deduplicateSources(sources)
    expect(result).toHaveLength(2)
    expect(result[0].source).toBe('Cochrane')
    expect(result[0].id).toBe('10')
    expect(result[1].id).toBe('11')
  })

  it('preserves WHO sources even when they share an ID with a PubMed source', () => {
    const sources = [
      makeSource('who-doc-1', 'WHO'),
      makeSource('pubmed-1', 'PubMed'),
    ]
    const result = deduplicateSources(sources)
    expect(result).toHaveLength(2)
  })

  it('returns an empty array for empty input', () => {
    expect(deduplicateSources([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/lib/__tests__/sources.test.ts
```

Expected: FAIL — `Cannot find module '../sources'`

- [ ] **Step 3: Implement `deduplicateSources`**

Create `src/lib/sources.ts`:

```typescript
import { Source } from './types'

export function deduplicateSources(sources: Source[]): Source[] {
  const seen = new Set<string>()
  const result: Source[] = []
  for (const source of sources) {
    if (!seen.has(source.id)) {
      seen.add(source.id)
      result.push(source)
    }
  }
  return result
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/lib/__tests__/sources.test.ts
```

Expected: PASS — 5 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/sources.ts src/lib/__tests__/sources.test.ts
git commit -m "feat: add deduplicateSources helper with tests"
```

---

### Task 3: Update `extractAndValidateClaim` to return multiple search queries

**Files:**
- Modify: `src/lib/pipeline.ts`
- Create: `src/lib/__tests__/pipeline.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/pipeline.test.ts`:

```typescript
import { vi, describe, it, expect } from 'vitest'

const mockCreate = vi.hoisted(() => vi.fn())

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({
    messages: { create: mockCreate },
  })),
}))

import { extractAndValidateClaim } from '../pipeline'

describe('extractAndValidateClaim', () => {
  it('returns searchQueries as an array for a valid health claim', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          isHealthClaim: true,
          extractedClaim: 'Adults should drink 2 litres of water per day',
          searchQueries: [
            'water intake daily requirements adults[MeSH]',
            'hydration fluid intake daily recommendations',
            'water consumption guidelines healthy adults',
          ],
        }),
      }],
    })

    const result = await extractAndValidateClaim('people should drink 2 liters of water everyday')

    expect(result.isHealthClaim).toBe(true)
    expect(result.extractedClaim).toBe('Adults should drink 2 litres of water per day')
    expect(Array.isArray(result.searchQueries)).toBe(true)
    expect(result.searchQueries).toHaveLength(3)
    expect(result.searchQueries[0]).toBe('water intake daily requirements adults[MeSH]')
  })

  it('returns empty searchQueries when input is not a health claim', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          isHealthClaim: false,
          extractedClaim: '',
          searchQueries: [],
          reason: 'This is a recipe, not a health claim.',
        }),
      }],
    })

    const result = await extractAndValidateClaim('here is my pasta recipe')

    expect(result.isHealthClaim).toBe(false)
    expect(result.searchQueries).toEqual([])
    expect(result.reason).toBe('This is a recipe, not a health claim.')
  })

  it('falls back gracefully when Claude returns malformed JSON', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'not json at all' }],
    })

    const result = await extractAndValidateClaim('coffee prevents cancer')

    expect(result.isHealthClaim).toBe(false)
    expect(result.searchQueries).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/lib/__tests__/pipeline.test.ts
```

Expected: FAIL — `result.searchQueries` is undefined (function currently returns `searchQuery: string`)

- [ ] **Step 3: Update `extractAndValidateClaim` in `src/lib/pipeline.ts`**

Replace the `extractAndValidateClaim` function (lines 11–50) with:

```typescript
export async function extractAndValidateClaim(userInput: string): Promise<{
  isHealthClaim: boolean
  extractedClaim: string
  searchQueries: string[]
  reason?: string
}> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `You are a claim analysis assistant. Your job is to determine if the following input contains a health or medical claim, and if so, extract it cleanly.

A health claim is any assertion about:
- Effects of food, drink, supplements, or substances on the body
- Disease prevention, treatment, or causes
- Exercise, sleep, or lifestyle effects on health
- Medical procedures or treatments
- Mental health interventions
- Nutritional science

User input: "${userInput}"

Respond ONLY with a JSON object, no markdown:
{
  "isHealthClaim": true/false,
  "extractedClaim": "the core falsifiable claim in one clear sentence, or empty string if not a health claim",
  "searchQueries": [
    "specific MeSH/clinical PubMed query using MeSH terms where appropriate",
    "broader synonym-based query covering alternative terminology for the same concept",
    "guideline or recommendation-focused query (e.g. including terms like guidelines, recommendations, consensus)"
  ],
  "reason": "if not a health claim, briefly explain why"
}`
    }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  try {
    const parsed = JSON.parse(stripMarkdownJson(text))
    if (!Array.isArray(parsed.searchQueries)) {
      parsed.searchQueries = parsed.searchQuery ? [parsed.searchQuery] : []
    }
    return parsed
  } catch {
    return { isHealthClaim: false, extractedClaim: '', searchQueries: [], reason: 'Could not parse claim.' }
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/lib/__tests__/pipeline.test.ts
```

Expected: PASS — 3 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/pipeline.ts src/lib/__tests__/pipeline.test.ts
git commit -m "feat: extract 3 search query variants from Stage 1"
```

---

### Task 4: Update the API route to fan out multi-query retrieval

**Files:**
- Modify: `src/app/api/check/route.ts`

- [ ] **Step 1: Replace `src/app/api/check/route.ts` with the multi-query version**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { extractAndValidateClaim, generateVerdict } from '@/lib/pipeline'
import { searchPubMed } from '@/lib/pubmed'
import { searchCochrane } from '@/lib/cochrane'
import { searchWhoIris } from '@/lib/whoiris'
import { deduplicateSources } from '@/lib/sources'
import { CheckResponse } from '@/lib/types'

export const maxDuration = 60

export async function POST(req: NextRequest): Promise<NextResponse<CheckResponse>> {
  try {
    const { claim } = await req.json()

    if (!claim || typeof claim !== 'string' || claim.trim().length < 10) {
      return NextResponse.json(
        { success: false, error: 'Please enter a health claim to check.' },
        { status: 400 }
      )
    }

    if (claim.trim().length > 500) {
      return NextResponse.json(
        { success: false, error: 'Please keep your claim under 500 characters.' },
        { status: 400 }
      )
    }

    const { isHealthClaim, extractedClaim, searchQueries, reason } = await extractAndValidateClaim(claim.trim())

    if (!isHealthClaim) {
      return NextResponse.json(
        {
          success: false,
          isHealthClaim: false,
          error: reason ?? 'This doesn\'t appear to be a health claim. Try something like "vitamin C prevents colds" or "red meat causes cancer".',
        },
        { status: 422 }
      )
    }

    // Fan out: 3 sources × N queries = 3N parallel fetches.
    // Order within each group is [PubMed, Cochrane, WHO] so the index modulo
    // pattern below correctly separates them for Cochrane-precedence dedup.
    const allResults = await Promise.all(
      searchQueries.flatMap(query => [
        searchPubMed(query),
        searchCochrane(query),
        searchWhoIris(query),
      ])
    )

    const pubmedBatches = allResults.filter((_, i) => i % 3 === 0)
    const cochraneBatches = allResults.filter((_, i) => i % 3 === 1)
    const whoBatches = allResults.filter((_, i) => i % 3 === 2)

    // Cochrane listed first so deduplicateSources gives it precedence over PubMed
    const sources = deduplicateSources([
      ...cochraneBatches.flat(),
      ...pubmedBatches.flat(),
      ...whoBatches.flat(),
    ])

    const verdict = await generateVerdict(extractedClaim, sources)

    return NextResponse.json({ success: true, verdict })
  } catch (err) {
    console.error('Check API error:', err)
    return NextResponse.json(
      { success: false, error: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: Errors only about `consensusNote` missing from `generateVerdict` return value — fixed in Task 5.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/check/route.ts
git commit -m "feat: fan out multi-query retrieval across 3 sources"
```

---

### Task 5: Add sparse evidence detection and consensus fallback to `generateVerdict`

**Files:**
- Modify: `src/lib/pipeline.ts`
- Modify: `src/lib/__tests__/pipeline.test.ts`

- [ ] **Step 1: Add tests for `generateVerdict` to `src/lib/__tests__/pipeline.test.ts`**

First, add these two imports at the top of `pipeline.test.ts`, alongside the existing `extractAndValidateClaim` import:

```typescript
import { extractAndValidateClaim, generateVerdict } from '../pipeline'
import type { Source } from '../types'
```

(Replace the existing `import { extractAndValidateClaim } from '../pipeline'` line with the line above.)

Then append the following to the bottom of `pipeline.test.ts` (after the closing brace of the `extractAndValidateClaim` describe block):

```typescript

function makeSource(id: string, abstract: string): Source {
  return {
    id,
    title: `Study ${id}`,
    authors: ['Author A'],
    journal: 'Test Journal',
    year: 2022,
    abstract,
    url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
    source: 'PubMed',
    evidenceTier: 'Clinical Trial',
  }
}

const REAL_ABSTRACT = 'This randomized controlled trial found statistically significant results.'
const NO_ABSTRACT = 'Abstract not available.'

describe('generateVerdict', () => {
  it('passes consensusNote through when Claude returns one', async () => {
    const sources = [makeSource('1', NO_ABSTRACT), makeSource('2', NO_ABSTRACT)]

    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          label: 'Insufficient Evidence',
          explanation: 'The retrieved sources do not directly address this claim.',
          evidenceSummary: 'No directly relevant studies found.',
          caveats: null,
          consensusNote: 'General health guidelines recommend adequate daily hydration, though exact quantities vary by individual.',
          sourceIndices: [],
        }),
      }],
    })

    const result = await generateVerdict('Adults should drink 2 litres of water per day', sources)

    expect(result.consensusNote).toBe(
      'General health guidelines recommend adequate daily hydration, though exact quantities vary by individual.'
    )
    expect(result.label).toBe('Insufficient Evidence')
  })

  it('sets consensusNote to null when Claude does not return one', async () => {
    const sources = [
      makeSource('10', REAL_ABSTRACT),
      makeSource('11', REAL_ABSTRACT),
      makeSource('12', REAL_ABSTRACT),
    ]

    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          label: 'Supported',
          explanation: 'Three trials found consistent evidence supporting this claim.',
          evidenceSummary: 'Based on three randomized controlled trials.',
          caveats: null,
          consensusNote: null,
          sourceIndices: [1, 2, 3],
        }),
      }],
    })

    const result = await generateVerdict('Vitamin C reduces cold duration', sources)

    expect(result.consensusNote).toBeNull()
    expect(result.label).toBe('Supported')
  })

  it('defaults consensusNote to null when Claude omits the field', async () => {
    const sources = [makeSource('20', REAL_ABSTRACT)]

    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          label: 'Contested',
          explanation: 'Mixed findings.',
          evidenceSummary: 'Based on one study.',
          caveats: 'Small sample size.',
          sourceIndices: [1],
          // consensusNote deliberately omitted
        }),
      }],
    })

    const result = await generateVerdict('Coffee prevents Alzheimer\'s', sources)

    expect(result.consensusNote).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to confirm the new ones fail**

```bash
npx vitest run src/lib/__tests__/pipeline.test.ts
```

Expected: The 3 new `generateVerdict` tests FAIL because `generateVerdict` doesn't yet return `consensusNote`.

- [ ] **Step 3: Update `generateVerdict` in `src/lib/pipeline.ts`**

Add the constant just above the `generateVerdict` function (after `stripMarkdownJson`):

```typescript
export const MIN_SOURCES_FOR_VERDICT = 3
```

Replace the entire `generateVerdict` function with:

```typescript
export async function generateVerdict(
  extractedClaim: string,
  sources: Source[]
): Promise<Verdict> {
  const sourcesContext = sources.map((s, i) => `
SOURCE ${i + 1}:
Title: ${s.title}
Journal: ${s.journal} (${s.year})
Evidence tier: ${s.evidenceTier}
Abstract: ${s.abstract}
URL: ${s.url}
`).join('\n---\n')

  const validAbstractCount = sources.filter(s => s.abstract !== 'Abstract not available.').length
  const sparseEvidence = validAbstractCount < MIN_SOURCES_FOR_VERDICT

  const consensusFallbackInstruction = sparseEvidence
    ? `\nIf the retrieved sources are insufficient to reach a verdict, you MAY add a brief "consensusNote" drawing on well-established scientific consensus — but ONLY for claims where consensus is genuinely unambiguous and widely accepted. Clearly label it as not from the retrieved sources. If no clear consensus exists, set consensusNote to null.`
    : ''

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: `You are a scientific fact-checker. Your ONLY job is to assess health claims based strictly on the provided scientific sources. 

CRITICAL RULES:
- You may ONLY use the provided sources. Do not use any other knowledge.
- If sources are insufficient, say so clearly.
- Never fabricate or embellish findings.
- Use plain, everyday language in explanations — avoid jargon.
- Be honest about uncertainty and limitations.
- Evidence tiers matter: Systematic Reviews > Clinical Trials > Observational Studies > Expert Consensus.${consensusFallbackInstruction}`,
    messages: [{
      role: 'user',
      content: `Assess this health claim based ONLY on the sources provided below.

CLAIM: "${extractedClaim}"

SOURCES:
${sourcesContext}

Respond ONLY with a JSON object, no markdown:
{
  "label": "Supported" | "Contested" | "Contradicted" | "Insufficient Evidence",
  "explanation": "2-3 sentences in plain everyday language explaining what the evidence shows. No jargon. Write as if explaining to a friend.",
  "evidenceSummary": "1 sentence describing the quality and quantity of evidence (e.g. 'Based on two randomized controlled trials and one systematic review')",
  "caveats": "Important limitations, caveats, or context the reader should know — or null if none",
  "consensusNote": "Brief plain-language note on scientific consensus if sources were insufficient — or null",
  "sourceIndices": [list of source index numbers (1-based) that were actually relevant to the verdict]
}`
    }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  let parsed: {
    label: VerdictLabel
    explanation: string
    evidenceSummary: string
    caveats: string | null
    consensusNote: string | null
    sourceIndices: number[]
  }

  try {
    parsed = JSON.parse(stripMarkdownJson(text))
  } catch {
    parsed = {
      label: 'Insufficient Evidence',
      explanation: 'We were unable to generate a verdict for this claim.',
      evidenceSummary: 'No evidence assessed.',
      caveats: null,
      consensusNote: null,
      sourceIndices: [],
    }
  }

  const relevantSources = parsed.sourceIndices
    .map(i => sources[i - 1])
    .filter(Boolean)

  return {
    label: parsed.label,
    explanation: parsed.explanation,
    evidenceSummary: parsed.evidenceSummary,
    caveats: parsed.caveats ?? null,
    consensusNote: parsed.consensusNote ?? null,
    sources: relevantSources.length > 0 ? relevantSources : sources.slice(0, 3),
    extractedClaim,
  }
}
```

- [ ] **Step 4: Run all pipeline tests**

```bash
npx vitest run src/lib/__tests__/pipeline.test.ts
```

Expected: PASS — all 6 tests passed

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```

Expected: All tests pass. TypeScript errors about `consensusNote` in `VerdictCard.tsx` are runtime warnings, not test failures — fixed in Task 6.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pipeline.ts src/lib/__tests__/pipeline.test.ts
git commit -m "feat: add sparse evidence detection and consensus fallback to Stage 3"
```

---

### Task 6: Render `consensusNote` in `VerdictCard`

**Files:**
- Modify: `src/components/VerdictCard.tsx`

- [ ] **Step 1: Add the `consensusNote` section to the VerdictCard component**

In `src/components/VerdictCard.tsx`, locate the caveats block (around line 96–101):

```tsx
      {/* Caveats */}
      {verdict.caveats && (
        <div className="animate-fade-slide-up-delay-2 bg-amber-50 border border-amber-100 rounded-xl p-4">
          <p className="text-xs font-mono text-amber-600 uppercase tracking-widest mb-1.5">⚠ Important caveats</p>
          <p className="text-amber-900 text-sm leading-relaxed">{verdict.caveats}</p>
        </div>
      )}
```

Add the consensus note block immediately after it:

```tsx
      {/* Consensus note — shown when peer-reviewed sources were sparse */}
      {verdict.consensusNote && (
        <div className="animate-fade-slide-up-delay-2 bg-stone-50 border border-stone-200 rounded-xl p-4">
          <p className="text-xs font-mono text-stone-500 uppercase tracking-widest mb-1.5">Scientific consensus context</p>
          <p className="text-stone-600 text-sm leading-relaxed">{verdict.consensusNote}</p>
          <p className="text-xs text-stone-400 mt-2 font-mono">Not from retrieved peer-reviewed sources.</p>
        </div>
      )}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Run the full test suite one final time**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/VerdictCard.tsx
git commit -m "feat: render consensus note in VerdictCard when sources are sparse"
```

---

### Task 7: Final verification and build check

**Files:** None modified.

- [ ] **Step 1: Run a full build**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors and no missing module errors.

- [ ] **Step 2: Smoke-test locally**

```bash
npm run dev
```

Open `http://localhost:3000` and submit the claim: `"People should drink 2 liters of water every day"`.

Expected: The result shows a verdict with multiple sources cited. If sources are sparse, a grey "Scientific consensus context" box appears below any caveats. The box includes the text "Not from retrieved peer-reviewed sources."
