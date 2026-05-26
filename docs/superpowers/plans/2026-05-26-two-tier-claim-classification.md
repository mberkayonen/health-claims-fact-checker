# Two-Tier Claim Classification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify health claims as `established` (basic biology) or `research` (needs evidence), route established claims to a fast single-Claude-call path that returns plain-English confirmation, and route research claims through the existing RAG pipeline.

**Architecture:** Stage 1 gains a `claimType` field. The API route branches on it — established claims call a new `generateEstablishedVerdict` function (no search), research claims use the existing multi-query RAG pipeline. A new `'Established Science'` verdict label gets its own teal UI treatment.

**Tech Stack:** Next.js 14, `@anthropic-ai/sdk`, TypeScript, Tailwind CSS, Vitest.

---

### Task 1: Add `'Established Science'` label and `context` field to types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Update `VerdictLabel` and `Verdict` in `src/lib/types.ts`**

Replace the entire file contents with:

```typescript
export type VerdictLabel =
  | 'Supported'
  | 'Contested'
  | 'Contradicted'
  | 'Insufficient Evidence'
  | 'Established Science'

export interface Source {
  id: string
  title: string
  authors: string[]
  journal: string
  year: number
  abstract: string
  url: string
  source: 'PubMed' | 'Cochrane' | 'WHO'
  evidenceTier: 'Systematic Review' | 'Clinical Trial' | 'Observational Study' | 'Expert Consensus' | 'Unknown'
}

export interface Verdict {
  label: VerdictLabel
  explanation: string
  evidenceSummary: string
  caveats: string | null
  consensusNote: string | null
  context: string | null
  sources: Source[]
  extractedClaim: string
}

export interface CheckResponse {
  success: boolean
  verdict?: Verdict
  error?: string
  isHealthClaim?: boolean
}
```

- [ ] **Step 2: Verify TypeScript errors are only in expected files**

```bash
npx tsc --noEmit 2>&1 | grep error
```

Expected: errors in `src/lib/pipeline.ts` about `context` missing from `Verdict` return objects. No errors in `types.ts` itself. This is expected — Tasks 2 and 4 fix them.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add Established Science label and context field to Verdict type"
```

---

### Task 2: Add `context: null` to `generateVerdict` return

**Files:**
- Modify: `src/lib/pipeline.ts`

- [ ] **Step 1: Add `context: null` to the `generateVerdict` return object**

In `src/lib/pipeline.ts`, find the return statement at the end of `generateVerdict` (currently around line 148–156):

```typescript
  return {
    label: parsed.label,
    explanation: parsed.explanation,
    evidenceSummary: parsed.evidenceSummary,
    caveats: parsed.caveats ?? null,
    consensusNote: parsed.consensusNote ?? null,
    sources: relevantSources.length > 0 ? relevantSources : sources.slice(0, 3),
    extractedClaim,
  }
```

Replace with:

```typescript
  return {
    label: parsed.label,
    explanation: parsed.explanation,
    evidenceSummary: parsed.evidenceSummary,
    caveats: parsed.caveats ?? null,
    consensusNote: parsed.consensusNote ?? null,
    context: null,
    sources: relevantSources.length > 0 ? relevantSources : sources.slice(0, 3),
    extractedClaim,
  }
```

- [ ] **Step 2: Verify TypeScript is now clean for `generateVerdict`**

```bash
npx tsc --noEmit 2>&1 | grep error
```

Expected: no errors related to `generateVerdict`. Remaining errors will be about `extractAndValidateClaim` missing `claimType` — fixed in Task 3.

- [ ] **Step 3: Run existing tests to confirm nothing broke**

```bash
npm test
```

Expected: 23 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/pipeline.ts
git commit -m "fix: add context: null to generateVerdict return to satisfy updated Verdict type"
```

---

### Task 3: Add `claimType` to `extractAndValidateClaim`

**Files:**
- Modify: `src/lib/pipeline.ts`
- Modify: `src/lib/__tests__/pipeline.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/lib/__tests__/pipeline.test.ts`, add these three tests to the `extractAndValidateClaim` describe block (after the existing three tests, before the closing `}`):

```typescript
  it('returns claimType established for a basic biology claim', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          isHealthClaim: true,
          claimType: 'established',
          extractedClaim: 'Humans need water to survive',
          searchQueries: [
            'water human physiology requirements',
            'hydration human body necessity',
            'water intake survival guidelines',
          ],
        }),
      }],
    })

    const result = await extractAndValidateClaim('humans need water')

    expect(result.isHealthClaim).toBe(true)
    expect(result.claimType).toBe('established')
  })

  it('returns claimType research for a nuanced intervention claim', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          isHealthClaim: true,
          claimType: 'research',
          extractedClaim: "Coffee prevents Alzheimer's disease",
          searchQueries: [
            "coffee Alzheimer's prevention[MeSH]",
            'caffeine cognitive decline risk',
            "coffee dementia prevention guidelines",
          ],
        }),
      }],
    })

    const result = await extractAndValidateClaim("coffee prevents Alzheimer's")

    expect(result.isHealthClaim).toBe(true)
    expect(result.claimType).toBe('research')
  })

  it('defaults claimType to research when Claude omits the field', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          isHealthClaim: true,
          extractedClaim: 'Some health claim',
          searchQueries: ['query one', 'query two', 'query three'],
          // claimType deliberately omitted
        }),
      }],
    })

    const result = await extractAndValidateClaim('some health claim')

    expect(result.claimType).toBe('research')
  })
```

- [ ] **Step 2: Run tests to confirm the new ones fail**

```bash
npx vitest run src/lib/__tests__/pipeline.test.ts
```

Expected: 3 new tests FAIL — `result.claimType` is undefined.

- [ ] **Step 3: Update `extractAndValidateClaim` in `src/lib/pipeline.ts`**

Replace the entire `extractAndValidateClaim` function with:

```typescript
export async function extractAndValidateClaim(userInput: string): Promise<{
  isHealthClaim: boolean
  claimType: 'established' | 'research'
  extractedClaim: string
  searchQueries: string[]
  reason?: string
}> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `You are a claim analysis assistant. Your job is to determine if the following input contains a health or medical claim, and if so, extract it cleanly and classify it.

A health claim is any assertion about:
- Effects of food, drink, supplements, or substances on the body
- Disease prevention, treatment, or causes
- Exercise, sleep, or lifestyle effects on health
- Medical procedures or treatments
- Mental health interventions
- Nutritional science

You must also classify the claim type:
- "established": foundational biology or medicine that any textbook states without a citation — not a contested research question. Examples: "humans need water", "smoking causes cancer", "sleep is important for health", "exercise benefits the heart".
- "research": a specific claim about an intervention, dose, association, or causation that requires study evidence to verify. Examples: "coffee prevents Alzheimer's", "vitamin D cures depression", "2 litres per day is optimal". When uncertain, use "research". Contested claims (e.g. anti-vaccine claims, alternative medicine) are always "research".

User input: "${userInput}"

Respond ONLY with a JSON object, no markdown:
{
  "isHealthClaim": true/false,
  "claimType": "established" or "research",
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
    if (parsed.claimType !== 'established' && parsed.claimType !== 'research') {
      parsed.claimType = 'research'
    }
    return parsed
  } catch {
    return { isHealthClaim: false, claimType: 'research', extractedClaim: '', searchQueries: [], reason: 'Could not parse claim.' }
  }
}
```

- [ ] **Step 4: Run all pipeline tests**

```bash
npx vitest run src/lib/__tests__/pipeline.test.ts
```

Expected: all 9 tests in the `extractAndValidateClaim` block pass (3 existing + 3 new from this task + 3 original that were already there — verify count matches).

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```

Expected: 26 tests pass across 5 files.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pipeline.ts src/lib/__tests__/pipeline.test.ts
git commit -m "feat: add claimType classification to Stage 1 extraction"
```

---

### Task 4: Add `generateEstablishedVerdict`

**Files:**
- Modify: `src/lib/pipeline.ts`
- Modify: `src/lib/__tests__/pipeline.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/lib/__tests__/pipeline.test.ts`, update the import at the top to include `generateEstablishedVerdict`:

```typescript
import { extractAndValidateClaim, generateVerdict, generateEstablishedVerdict } from '../pipeline'
```

Then append a new describe block at the bottom of the file (after the closing `}` of the `generateVerdict` describe block):

```typescript
describe('generateEstablishedVerdict', () => {
  it('returns an Established Science verdict with context and empty sources', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          explanation: 'Yes, water is essential for life. Your body uses it for digestion, temperature regulation, and carrying nutrients to cells. Without adequate water, organs fail within days.',
          context: 'This is foundational human physiology, not a contested research question.',
          caveats: null,
        }),
      }],
    })

    const result = await generateEstablishedVerdict('Humans need water to survive')

    expect(result.label).toBe('Established Science')
    expect(result.sources).toEqual([])
    expect(result.context).toBe('This is foundational human physiology, not a contested research question.')
    expect(result.consensusNote).toBeNull()
    expect(result.extractedClaim).toBe('Humans need water to survive')
    expect(result.explanation).toContain('water is essential')
  })

  it('falls back to default text when Claude returns malformed JSON', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'not valid json at all' }],
    })

    const result = await generateEstablishedVerdict('Exercise is good for health')

    expect(result.label).toBe('Established Science')
    expect(result.sources).toEqual([])
    expect(result.context).not.toBeNull()
    expect(result.explanation).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run tests to confirm the new ones fail**

```bash
npx vitest run src/lib/__tests__/pipeline.test.ts
```

Expected: 2 new `generateEstablishedVerdict` tests FAIL — `generateEstablishedVerdict is not a function`.

- [ ] **Step 3: Add `generateEstablishedVerdict` to `src/lib/pipeline.ts`**

Add this function after `generateVerdict` (at the end of the file):

```typescript
export async function generateEstablishedVerdict(
  extractedClaim: string
): Promise<Verdict> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: `You are a friendly science communicator. Your job is to confirm well-established scientific facts in plain, accessible language for everyday people — not scientists. Be warm, clear, and informative.`,
    messages: [{
      role: 'user',
      content: `Confirm this established health or biology fact and explain why it's true in plain language.

CLAIM: "${extractedClaim}"

Respond ONLY with a JSON object, no markdown:
{
  "explanation": "2-3 sentences confirming the claim and explaining why it's true. Plain everyday language, no jargon. Like explaining to a curious friend.",
  "context": "1 sentence of broader biological or medical context — where does this fit in the bigger picture?",
  "caveats": "Any important nuances or exceptions worth knowing — or null if none"
}`
    }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  let parsed: {
    explanation: string
    context: string
    caveats: string | null
  }

  try {
    parsed = JSON.parse(stripMarkdownJson(text))
  } catch {
    parsed = {
      explanation: 'This is a well-established scientific fact supported by foundational biology and medicine.',
      context: 'This is foundational science — not a contested research question.',
      caveats: null,
    }
  }

  return {
    label: 'Established Science',
    explanation: parsed.explanation,
    evidenceSummary: 'This is foundational science — not a contested research question.',
    caveats: parsed.caveats ?? null,
    consensusNote: null,
    context: parsed.context ?? null,
    sources: [],
    extractedClaim,
  }
}
```

- [ ] **Step 4: Run all pipeline tests**

```bash
npx vitest run src/lib/__tests__/pipeline.test.ts
```

Expected: all tests pass (existing + 3 claimType tests + 2 new generateEstablishedVerdict tests).

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```

Expected: 28 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pipeline.ts src/lib/__tests__/pipeline.test.ts
git commit -m "feat: add generateEstablishedVerdict for foundational biology claims"
```

---

### Task 5: Update API route to branch on `claimType`

**Files:**
- Modify: `src/app/api/check/route.ts`

- [ ] **Step 1: Replace `src/app/api/check/route.ts` with the branching version**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { extractAndValidateClaim, generateVerdict, generateEstablishedVerdict } from '@/lib/pipeline'
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

    const { isHealthClaim, claimType, extractedClaim, searchQueries, reason } =
      await extractAndValidateClaim(claim.trim())

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

    // Fast path: established science needs no literature search
    if (claimType === 'established') {
      try {
        const verdict = await generateEstablishedVerdict(extractedClaim)
        return NextResponse.json({ success: true, verdict })
      } catch (err) {
        console.error('Established verdict failed, falling back to research pipeline:', err)
        // fall through to research pipeline below
      }
    }

    // Research path: fan out across 3 sources × N queries in parallel.
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

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: 28 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/check/route.ts
git commit -m "feat: branch API route on claimType — established skips RAG pipeline"
```

---

### Task 6: Update `VerdictCard` and loading text

**Files:**
- Modify: `src/components/VerdictCard.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Update `VERDICT_CONFIG` in `src/components/VerdictCard.tsx`**

In `VerdictCard.tsx`, add `'Established Science'` to the `VERDICT_CONFIG` object. Find the closing `}` of `VERDICT_CONFIG` (after the `'Insufficient Evidence'` entry) and add:

```typescript
  'Established Science': {
    bg: 'bg-teal-50',
    border: 'border-teal-200',
    text: 'text-teal-800',
    dot: 'bg-teal-500',
    label: 'Established science',
    description: 'This is foundational biology or medicine — not a contested research question.',
  },
```

- [ ] **Step 2: Render the `context` field inside the verdict badge**

In `VerdictCard.tsx`, find the verdict badge block:

```tsx
      {/* Verdict badge */}
      <div className={`animate-fade-slide-up-delay-1 rounded-2xl border ${config.bg} ${config.border} p-5`}>
        <div className="flex items-center gap-3 mb-3">
          <span className={`w-2.5 h-2.5 rounded-full ${config.dot} flex-shrink-0`} />
          <span className={`font-display text-xl ${config.text}`}>{config.label}</span>
        </div>
        <p className="text-stone-700 leading-relaxed">{verdict.explanation}</p>
      </div>
```

Replace with:

```tsx
      {/* Verdict badge */}
      <div className={`animate-fade-slide-up-delay-1 rounded-2xl border ${config.bg} ${config.border} p-5`}>
        <div className="flex items-center gap-3 mb-3">
          <span className={`w-2.5 h-2.5 rounded-full ${config.dot} flex-shrink-0`} />
          <span className={`font-display text-xl ${config.text}`}>{config.label}</span>
        </div>
        <p className="text-stone-700 leading-relaxed">{verdict.explanation}</p>
        {verdict.context && (
          <p className="text-sm text-teal-700 mt-2 italic">{verdict.context}</p>
        )}
      </div>
```

- [ ] **Step 3: Make the sources section conditional on non-empty sources**

In `VerdictCard.tsx`, find the sources section:

```tsx
      {/* Sources */}
      <div className="animate-fade-slide-up-delay-3">
        <p className="text-xs font-mono text-stone-400 uppercase tracking-widest mb-3">
          Sources consulted ({verdict.sources.length})
        </p>
        <div className="space-y-3">
          {verdict.sources.map((source, i) => (
```

Wrap the entire sources `<div>` in a conditional:

```tsx
      {/* Sources — hidden for Established Science verdicts which have no citations */}
      {verdict.sources.length > 0 && (
        <div className="animate-fade-slide-up-delay-3">
          <p className="text-xs font-mono text-stone-400 uppercase tracking-widest mb-3">
            Sources consulted ({verdict.sources.length})
          </p>
          <div className="space-y-3">
            {verdict.sources.map((source, i) => (
```

Close the new conditional wrapper after the closing `</div>` of the sources section (before the transparency footer), adding `)}` after `</div>`.

- [ ] **Step 4: Update the transparency footer to be accurate for both paths**

In `VerdictCard.tsx`, find the transparency footer:

```tsx
      {/* Transparency footer */}
      <div className="animate-fade-slide-up-delay-3 border-t border-stone-200 pt-4">
        <p className="text-xs text-stone-400 leading-relaxed">
          This verdict is generated by AI and grounded only in the sources listed above from PubMed/MEDLINE, Cochrane Database, and WHO IRIS.
          It is not medical advice. Always consult a healthcare professional for personal health decisions.
        </p>
      </div>
```

Replace with:

```tsx
      {/* Transparency footer */}
      <div className="animate-fade-slide-up-delay-3 border-t border-stone-200 pt-4">
        <p className="text-xs text-stone-400 leading-relaxed">
          {verdict.sources.length > 0
            ? 'This verdict is generated by AI and grounded only in the sources listed above from PubMed/MEDLINE, Cochrane Database, and WHO IRIS.'
            : 'This verdict is generated by AI based on established scientific consensus.'}
          {' '}It is not medical advice. Always consult a healthcare professional for personal health decisions.
        </p>
      </div>
```

- [ ] **Step 5: Update the loading text in `src/app/page.tsx`**

In `src/app/page.tsx`, find the loading state paragraph:

```tsx
            <p className="text-xs font-mono text-stone-400 uppercase tracking-widest mb-6">
              Searching PubMed and assessing evidence...
            </p>
```

Replace with:

```tsx
            <p className="text-xs font-mono text-stone-400 uppercase tracking-widest mb-6">
              Checking your claim against the evidence...
            </p>
```

- [ ] **Step 6: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Run full test suite**

```bash
npm test
```

Expected: 28 tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/VerdictCard.tsx src/app/page.tsx
git commit -m "feat: add Established Science UI — teal badge, context field, conditional sources"
```

---

### Task 7: Final verification and build check

**Files:** None modified.

- [ ] **Step 1: Run a full production build**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors and no missing module errors.

- [ ] **Step 2: Smoke-test locally**

```bash
npm run dev
```

Open `http://localhost:3000` and test two claims:

**Claim 1:** `"humans need water"`
Expected: Teal "Established science" badge, 2–3 sentences of plain explanation, a context sentence in italic, no sources section, footer says "established scientific consensus".

**Claim 2:** `"coffee prevents Alzheimer's disease"`
Expected: The existing verdict flow (Supported / Contested / Contradicted / Insufficient Evidence), sources listed, full footer.
