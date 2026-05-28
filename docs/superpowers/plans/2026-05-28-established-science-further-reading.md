# Established Science — Further Reading Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attach real peer-reviewed sources to Established Science verdicts as "further reading", fetched in parallel with the Claude call so latency stays minimal.

**Architecture:** In the established branch of the API route, replace the single `await generateEstablishedVerdict()` with a `Promise.allSettled` that runs the Claude call and the 9-fetch search fan-out simultaneously. Sources are merged onto the verdict after both settle. Search failure is non-fatal — the established verdict is still returned with `sources: []`. Three targeted UI tweaks in `VerdictCard` make the sources display accurately for this context ("Further reading" header, evidence quality hidden, updated footer copy).

**Tech Stack:** Next.js 14, TypeScript, `Promise.allSettled`, Tailwind CSS, Vitest.

---

### Task 1: Update route and tests — parallel search for established claims

**Files:**
- Modify: `src/app/api/check/route.ts`
- Modify: `src/app/api/__tests__/route.test.ts`

---

#### Background

The current established branch in `src/app/api/check/route.ts` (lines 43–52):

```typescript
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
```

Two existing route tests live in `src/app/api/__tests__/route.test.ts`:
1. `'calls generateEstablishedVerdict and skips search for established claims'` — asserts `mockSearchPubMed` NOT called. **This assertion becomes wrong after our change** (search will now be called in parallel).
2. `'falls back to research pipeline when generateEstablishedVerdict throws'` — unchanged, still valid.

---

- [ ] **Step 1: Update the first existing test to expect parallel search**

In `src/app/api/__tests__/route.test.ts`, replace the first test (lines 37–67) with:

```typescript
  it('calls generateEstablishedVerdict in parallel with search and attaches sources', async () => {
    mockExtractAndValidateClaim.mockResolvedValueOnce({
      isHealthClaim: true,
      claimType: 'established',
      extractedClaim: 'Humans need water to survive',
      searchQueries: ['water physiology'],
    })

    const establishedVerdict = {
      label: 'Established Science' as const,
      explanation: 'Water is essential for life.',
      evidenceSummary: 'This is foundational science — not a contested research question.',
      caveats: null,
      consensusNote: null,
      context: 'Foundational human physiology.',
      sources: [],
      extractedClaim: 'Humans need water to survive',
    }

    const furtherReadingSources = [{
      id: 'pm1',
      title: 'Water and human health',
      authors: [],
      journal: 'Nature',
      year: 2020,
      abstract: 'Abstract',
      url: 'http://pubmed.example.com/1',
      source: 'PubMed' as const,
      evidenceTier: 'Clinical Trial' as const,
    }]

    mockGenerateEstablishedVerdict.mockResolvedValueOnce(establishedVerdict)
    mockSearchPubMed.mockResolvedValue(furtherReadingSources)
    mockSearchCochrane.mockResolvedValue([])
    mockSearchWhoIris.mockResolvedValue([])
    mockDeduplicateSources.mockReturnValue(furtherReadingSources)

    const res = await POST(makeRequest({ claim: 'humans need water' }))
    const body = await res.json()

    expect(body.success).toBe(true)
    expect(body.verdict.label).toBe('Established Science')
    expect(mockGenerateEstablishedVerdict).toHaveBeenCalledWith('Humans need water to survive')
    expect(mockSearchPubMed).toHaveBeenCalled()
    expect(body.verdict.sources).toEqual(furtherReadingSources)
    expect(mockGenerateVerdict).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Add a new test for search failure**

After the updated first test (before the second existing test), add:

```typescript
  it('returns established verdict with empty sources when search fails', async () => {
    mockExtractAndValidateClaim.mockResolvedValueOnce({
      isHealthClaim: true,
      claimType: 'established',
      extractedClaim: 'Humans need water to survive',
      searchQueries: ['water physiology'],
    })

    const establishedVerdict = {
      label: 'Established Science' as const,
      explanation: 'Water is essential for life.',
      evidenceSummary: 'This is foundational science — not a contested research question.',
      caveats: null,
      consensusNote: null,
      context: 'Foundational human physiology.',
      sources: [],
      extractedClaim: 'Humans need water to survive',
    }

    mockGenerateEstablishedVerdict.mockResolvedValueOnce(establishedVerdict)
    mockSearchPubMed.mockRejectedValueOnce(new Error('Network error'))
    mockSearchCochrane.mockResolvedValue([])
    mockSearchWhoIris.mockResolvedValue([])

    const res = await POST(makeRequest({ claim: 'humans need water' }))
    const body = await res.json()

    expect(body.success).toBe(true)
    expect(body.verdict.label).toBe('Established Science')
    expect(body.verdict.sources).toEqual([])
    expect(mockSearchPubMed).toHaveBeenCalled()
    expect(mockGenerateVerdict).not.toHaveBeenCalled()
  })
```

- [ ] **Step 3: Run the route tests to confirm the two new/updated tests fail**

```bash
npx vitest run src/app/api/__tests__/route.test.ts
```

Expected:
- `'calls generateEstablishedVerdict in parallel with search and attaches sources'` — FAIL (`body.verdict.sources` is `[]`, not `furtherReadingSources`)
- `'returns established verdict with empty sources when search fails'` — FAIL (`mockSearchPubMed` was never called)
- `'falls back to research pipeline...'` — still PASS

- [ ] **Step 4: Update the established branch in `src/app/api/check/route.ts`**

Replace lines 43–52 (the entire `if (claimType === 'established') { ... }` block) with:

```typescript
    // Established path: verdict from Claude parametric knowledge, sources fetched in
    // parallel as further reading. Search failure is non-fatal — verdict still returns.
    if (claimType === 'established') {
      try {
        const [verdictSettled, sourcesSettled] = await Promise.allSettled([
          generateEstablishedVerdict(extractedClaim),
          (async () => {
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
            return deduplicateSources([
              ...cochraneBatches.flat(),
              ...pubmedBatches.flat(),
              ...whoBatches.flat(),
            ])
          })(),
        ])

        if (verdictSettled.status === 'rejected') throw verdictSettled.reason

        const furtherReadingSources = sourcesSettled.status === 'fulfilled'
          ? sourcesSettled.value
          : []
        if (sourcesSettled.status === 'rejected') {
          console.error('Further reading search failed for established claim:', sourcesSettled.reason)
        }

        return NextResponse.json({
          success: true,
          verdict: { ...verdictSettled.value, sources: furtherReadingSources },
        })
      } catch (err) {
        console.error('Established verdict failed, falling back to research pipeline:', err)
        // fall through to research pipeline below
      }
    }
```

The full file after the edit:

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

    // Established path: verdict from Claude parametric knowledge, sources fetched in
    // parallel as further reading. Search failure is non-fatal — verdict still returns.
    if (claimType === 'established') {
      try {
        const [verdictSettled, sourcesSettled] = await Promise.allSettled([
          generateEstablishedVerdict(extractedClaim),
          (async () => {
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
            return deduplicateSources([
              ...cochraneBatches.flat(),
              ...pubmedBatches.flat(),
              ...whoBatches.flat(),
            ])
          })(),
        ])

        if (verdictSettled.status === 'rejected') throw verdictSettled.reason

        const furtherReadingSources = sourcesSettled.status === 'fulfilled'
          ? sourcesSettled.value
          : []
        if (sourcesSettled.status === 'rejected') {
          console.error('Further reading search failed for established claim:', sourcesSettled.reason)
        }

        return NextResponse.json({
          success: true,
          verdict: { ...verdictSettled.value, sources: furtherReadingSources },
        })
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

- [ ] **Step 5: Run all route tests**

```bash
npx vitest run src/app/api/__tests__/route.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 6: Run the full test suite**

```bash
npm test
```

Expected: 31 tests pass (was 30, +1 new test).

- [ ] **Step 7: Commit**

```bash
git add src/app/api/check/route.ts src/app/api/__tests__/route.test.ts
git commit -m "feat: fetch further reading sources in parallel for established science claims"
```

---

### Task 2: Update VerdictCard UI

**Files:**
- Modify: `src/components/VerdictCard.tsx`

---

#### Background

Three things need to change now that established claims have sources:

1. **Evidence quality block** (line 101): currently hidden when `sources.length === 0`. Since established claims now have sources, this condition alone would show the block — but it shouldn't, because "Evidence quality" doesn't make sense for a verdict derived from parametric knowledge, not sources. Switch the guard from `sources.length > 0` to `label !== 'Established Science'`.

2. **Sources section header** (line 128–130): currently always reads `"Sources consulted (N)"`. For established claims it should read `"Further reading (N)"` — honest about the fact that these papers weren't used to derive the verdict.

3. **Transparency footer** (lines 168–171): currently a 2-way branch on `sources.length > 0`. Add an explicit 3-way branch with a new message for established claims with sources.

---

- [ ] **Step 1: Change the evidence quality guard**

In `src/components/VerdictCard.tsx`, find (line 101):

```tsx
      {verdict.sources.length > 0 && (
        <div className="animate-fade-slide-up-delay-2">
          <p className="text-xs font-mono text-stone-400 uppercase tracking-widest mb-2">Evidence quality</p>
          <p className="text-stone-600 text-sm">{verdict.evidenceSummary}</p>
        </div>
      )}
```

Replace with:

```tsx
      {verdict.label !== 'Established Science' && (
        <div className="animate-fade-slide-up-delay-2">
          <p className="text-xs font-mono text-stone-400 uppercase tracking-widest mb-2">Evidence quality</p>
          <p className="text-stone-600 text-sm">{verdict.evidenceSummary}</p>
        </div>
      )}
```

- [ ] **Step 2: Change the sources section header to be conditional**

Find (lines 128–130):

```tsx
          <p className="text-xs font-mono text-stone-400 uppercase tracking-widest mb-3">
            Sources consulted ({verdict.sources.length})
          </p>
```

Replace with:

```tsx
          <p className="text-xs font-mono text-stone-400 uppercase tracking-widest mb-3">
            {verdict.label === 'Established Science'
              ? `Further reading (${verdict.sources.length})`
              : `Sources consulted (${verdict.sources.length})`}
          </p>
```

- [ ] **Step 3: Update the transparency footer**

Find (lines 168–171):

```tsx
          {verdict.sources.length > 0
            ? 'This verdict is generated by AI and grounded only in the sources listed above from PubMed/MEDLINE, Cochrane Database, and WHO IRIS.'
            : 'This verdict is generated by AI based on established scientific consensus.'}
```

Replace with:

```tsx
          {verdict.label === 'Established Science'
            ? 'The explanation above reflects established scientific consensus. The sources below are provided for further reading — they were not used to generate this verdict.'
            : verdict.sources.length > 0
              ? 'This verdict is generated by AI and grounded only in the sources listed above from PubMed/MEDLINE, Cochrane Database, and WHO IRIS.'
              : 'This verdict is generated by AI based on established scientific consensus.'}
```

- [ ] **Step 4: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: no errors (ignoring the pre-existing Vitest type mismatch in test files).

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: 31 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/VerdictCard.tsx
git commit -m "feat: show further reading header and updated footer for established science verdicts"
```

---

### Task 3: Final verification

**Files:** None modified.

- [ ] **Step 1: Run production build**

```bash
npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 2: Smoke-test locally**

```bash
npm run dev
```

Open `http://localhost:3000` and test two claims:

**Claim 1:** `"humans need water"`
Expected:
- Teal "Established science" badge
- Plain-English explanation + italic context sentence
- **"Further reading (N)"** section below with real PubMed/Cochrane/WHO papers
- Footer reads: *"The explanation above reflects established scientific consensus. The sources below are provided for further reading — they were not used to generate this verdict."*
- No "Evidence quality" section

**Claim 2:** `"coffee prevents Alzheimer's disease"`
Expected:
- Existing verdict flow (Supported / Contested / Contradicted / Insufficient Evidence)
- **"Sources consulted (N)"** header — unchanged
- Evidence quality section visible
- Original research-grounded footer text
