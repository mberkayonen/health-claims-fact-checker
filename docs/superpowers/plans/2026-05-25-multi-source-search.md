# Multi-Source Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Cochrane Reviews (via PubMed journal filter) and WHO IRIS as search sources alongside PubMed, running all three concurrently and merging deduplicated results.

**Architecture:** Extract a shared `fetchPubMedByQuery` helper from `pubmed.ts`. New `cochrane.ts` and `whoiris.ts` modules each call their respective APIs and return typed `Source[]`. The API route runs all three with `Promise.all()`, deduplicates by ID (Cochrane takes precedence over PubMed for shared PMIDs), then passes the merged pool to Claude. Each module degrades gracefully to `[]` on failure.

**Tech Stack:** NCBI E-utilities (PubMed + Cochrane filter), WHO IRIS DSpace 7 REST API, Vitest (tests)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/lib/pubmed.ts` | Extract `fetchPubMedByQuery` shared helper; `searchPubMed` wraps it |
| Create | `src/lib/cochrane.ts` | Cochrane search: appends journal filter, labels results `'Cochrane'` |
| Create | `src/lib/whoiris.ts` | WHO IRIS search via DSpace 7 discovery API |
| Modify | `src/app/api/check/route.ts` | Parallel fetch from all 3 sources, deduplication, pass merged pool to Claude |
| Create | `src/lib/__tests__/pubmed.test.ts` | Unit tests for `searchPubMed` |
| Create | `src/lib/__tests__/cochrane.test.ts` | Unit tests for `searchCochrane` |
| Create | `src/lib/__tests__/whoiris.test.ts` | Unit tests for `searchWhoIris` |
| Create | `vitest.config.ts` | Vitest config with `@` path alias |
| Modify | `package.json` | Add vitest dev dep + test scripts |

---

### Task 1: Set up Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1.1: Install vitest**

```bash
cd /Users/mebeon/dev/bogus-claim-check/healthcheck
npm install --save-dev vitest@^1.6.0
```

Expected: `vitest` appears in `package.json` devDependencies.

- [ ] **Step 1.2: Add test scripts to package.json**

In `package.json`, update the `"scripts"` section to:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 1.3: Create vitest.config.ts**

Create `/Users/mebeon/dev/bogus-claim-check/healthcheck/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 1.4: Verify vitest runs**

```bash
cd /Users/mebeon/dev/bogus-claim-check/healthcheck && npx vitest run 2>&1 | head -10
```

Expected: Output contains "No test files found" or similar — no crash, just no tests yet.

- [ ] **Step 1.5: Commit**

```bash
cd /Users/mebeon/dev/bogus-claim-check/healthcheck
git init && git add package.json vitest.config.ts package-lock.json
git commit -m "chore: add vitest test infrastructure"
```

---

### Task 2: Refactor pubmed.ts to extract shared helper

**Files:**
- Modify: `src/lib/pubmed.ts`
- Create: `src/lib/__tests__/pubmed.test.ts`

The current `searchPubMed` contains all the NCBI fetch logic inline. Extract it into an exported `fetchPubMedByQuery(query, maxResults)` that returns raw article data. Both `searchPubMed` and the forthcoming `searchCochrane` will use this helper. The external behaviour of `searchPubMed` stays identical.

- [ ] **Step 2.1: Write the failing test**

Create `src/lib/__tests__/pubmed.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchPubMed } from '../pubmed'

const mockFetch = vi.fn()
global.fetch = mockFetch as typeof fetch

describe('searchPubMed', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns empty array when no IDs found', async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({ esearchresult: { idlist: [] } }),
    } as Response)

    const results = await searchPubMed('nonexistent query xyz')

    expect(results).toEqual([])
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('returns sources labelled as PubMed with correct shape', async () => {
    mockFetch
      .mockResolvedValueOnce({
        json: async () => ({ esearchresult: { idlist: ['99999'] } }),
      } as Response)
      .mockResolvedValueOnce({
        json: async () => ({
          result: {
            '99999': {
              title: 'Vitamin D and Health',
              authors: [{ name: 'Jones A' }, { name: 'Smith B' }],
              fulljournalname: 'The Lancet',
              source: 'Lancet',
              pubdate: '2023 Jan',
              pubtype: ['Randomized Controlled Trial'],
            },
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        text: async () =>
          '<PubmedArticle><PMID>99999</PMID><AbstractText>Vitamin D plays a role in immune function.</AbstractText></PubmedArticle>',
      } as Response)

    const results = await searchPubMed('vitamin D')

    expect(results).toHaveLength(1)
    expect(results[0].source).toBe('PubMed')
    expect(results[0].id).toBe('99999')
    expect(results[0].title).toBe('Vitamin D and Health')
    expect(results[0].authors).toEqual(['Jones A', 'Smith B'])
    expect(results[0].evidenceTier).toBe('Clinical Trial')
    expect(results[0].abstract).toBe('Vitamin D plays a role in immune function.')
    expect(results[0].url).toBe('https://pubmed.ncbi.nlm.nih.gov/99999/')
  })

  it('returns empty array on network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    const results = await searchPubMed('vitamin D')
    expect(results).toEqual([])
  })
})
```

- [ ] **Step 2.2: Run test to confirm it fails or passes**

```bash
cd /Users/mebeon/dev/bogus-claim-check/healthcheck && npx vitest run src/lib/__tests__/pubmed.test.ts --reporter verbose 2>&1
```

Note the result. If tests already pass, skip to Step 2.4.

- [ ] **Step 2.3: Replace pubmed.ts with refactored version**

Replace the full content of `src/lib/pubmed.ts`:

```typescript
import { Source } from './types'

const PUBMED_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'

interface PubMedArticle {
  title: string
  authors: { name: string }[]
  source: string
  pubdate: string
  fulljournalname: string
  pubtype: string[]
}

export interface RawPubMedArticle {
  id: string
  title: string
  authors: string[]
  journal: string
  year: number
  abstract: string
  pubtype: string[]
}

function inferEvidenceTier(pubtypes: string[]): Source['evidenceTier'] {
  const types = pubtypes.map(t => t.toLowerCase())
  if (types.some(t => t.includes('systematic') || t.includes('meta-analysis'))) return 'Systematic Review'
  if (types.some(t => t.includes('randomized') || t.includes('clinical trial') || t.includes('controlled'))) return 'Clinical Trial'
  if (types.some(t => t.includes('observational') || t.includes('cohort') || t.includes('case'))) return 'Observational Study'
  if (types.some(t => t.includes('review') || t.includes('consensus') || t.includes('guideline'))) return 'Expert Consensus'
  return 'Unknown'
}

export async function fetchPubMedByQuery(query: string, maxResults: number): Promise<RawPubMedArticle[]> {
  const searchUrl = `${PUBMED_BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json&sort=relevance`
  const searchRes = await fetch(searchUrl)
  const searchData = await searchRes.json()
  const ids: string[] = searchData?.esearchresult?.idlist ?? []

  if (ids.length === 0) return []

  const summaryUrl = `${PUBMED_BASE}/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`
  const summaryRes = await fetch(summaryUrl)
  const summaryData = await summaryRes.json()
  const result = summaryData?.result ?? {}

  const fetchUrl = `${PUBMED_BASE}/efetch.fcgi?db=pubmed&id=${ids.join(',')}&retmode=xml&rettype=abstract`
  const fetchRes = await fetch(fetchUrl)
  const xmlText = await fetchRes.text()

  const abstractMap: Record<string, string> = {}
  const articleBlocks = xmlText.split(/<PubmedArticle[>\s]/)
  articleBlocks.forEach(block => {
    const idMatch = block.match(/<PMID[^>]*>(\d+)<\/PMID>/)
    if (!idMatch) return
    const id = idMatch[1]
    const abstractMatches = block.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)
    if (abstractMatches) {
      abstractMap[id] = abstractMatches
        .map(m => m.replace(/<[^>]+>/g, ''))
        .join(' ')
        .slice(0, 600)
    }
  })

  return ids
    .filter(id => result[id] && result[id].title)
    .map((id): RawPubMedArticle => {
      const article: PubMedArticle = result[id]
      const year = parseInt(article.pubdate?.split(' ')[0] ?? '0') || 0
      return {
        id,
        title: article.title ?? 'Untitled',
        authors: (article.authors ?? []).slice(0, 3).map((a: { name: string }) => a.name),
        journal: article.fulljournalname ?? article.source ?? 'Unknown journal',
        year,
        abstract: abstractMap[id] ?? 'Abstract not available.',
        pubtype: article.pubtype ?? [],
      }
    })
}

export async function searchPubMed(query: string): Promise<Source[]> {
  try {
    const articles = await fetchPubMedByQuery(query, 5)
    return articles.map(a => ({
      ...a,
      url: `https://pubmed.ncbi.nlm.nih.gov/${a.id}/`,
      source: 'PubMed' as const,
      evidenceTier: inferEvidenceTier(a.pubtype),
    }))
  } catch (err) {
    console.error('PubMed fetch error:', err)
    return []
  }
}
```

- [ ] **Step 2.4: Run tests to confirm they all pass**

```bash
cd /Users/mebeon/dev/bogus-claim-check/healthcheck && npx vitest run src/lib/__tests__/pubmed.test.ts --reporter verbose 2>&1
```

Expected: All 3 tests PASS.

- [ ] **Step 2.5: Commit**

```bash
cd /Users/mebeon/dev/bogus-claim-check/healthcheck
git add src/lib/pubmed.ts src/lib/__tests__/pubmed.test.ts
git commit -m "refactor: extract fetchPubMedByQuery shared helper, add pubmed tests"
```

---

### Task 3: Build cochrane.ts

**Files:**
- Create: `src/lib/cochrane.ts`
- Create: `src/lib/__tests__/cochrane.test.ts`

`searchCochrane` adds `AND "Cochrane Database Syst Rev"[Journal]` to the query, delegates to `fetchPubMedByQuery`, then relabels results as `source: 'Cochrane'` with a hardcoded `evidenceTier: 'Systematic Review'` (all Cochrane entries are systematic reviews by definition).

- [ ] **Step 3.1: Write the failing test**

Create `src/lib/__tests__/cochrane.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchCochrane } from '../cochrane'

const mockFetch = vi.fn()
global.fetch = mockFetch as typeof fetch

describe('searchCochrane', () => {
  beforeEach(() => vi.clearAllMocks())

  it('appends Cochrane journal filter to the query', async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({ esearchresult: { idlist: [] } }),
    } as Response)

    await searchCochrane('vitamin D depression')

    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('Cochrane')
    expect(url).toContain('vitamin')
  })

  it('labels results as Cochrane with Systematic Review tier', async () => {
    mockFetch
      .mockResolvedValueOnce({
        json: async () => ({ esearchresult: { idlist: ['55555'] } }),
      } as Response)
      .mockResolvedValueOnce({
        json: async () => ({
          result: {
            '55555': {
              title: 'Cochrane Review: Vitamin D and Mood',
              authors: [{ name: 'Brown C' }],
              fulljournalname: 'Cochrane Database of Systematic Reviews',
              source: 'Cochrane Database Syst Rev',
              pubdate: '2021',
              pubtype: ['Review'],
            },
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        text: async () =>
          '<PubmedArticle><PMID>55555</PMID><AbstractText>A comprehensive Cochrane review of vitamin D.</AbstractText></PubmedArticle>',
      } as Response)

    const results = await searchCochrane('vitamin D')

    expect(results).toHaveLength(1)
    expect(results[0].source).toBe('Cochrane')
    expect(results[0].evidenceTier).toBe('Systematic Review')
    expect(results[0].id).toBe('55555')
    expect(results[0].url).toBe('https://pubmed.ncbi.nlm.nih.gov/55555/')
    expect(results[0].abstract).toBe('A comprehensive Cochrane review of vitamin D.')
  })

  it('returns empty array on network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    const results = await searchCochrane('vitamin D')
    expect(results).toEqual([])
  })
})
```

- [ ] **Step 3.2: Run test to confirm it fails**

```bash
cd /Users/mebeon/dev/bogus-claim-check/healthcheck && npx vitest run src/lib/__tests__/cochrane.test.ts --reporter verbose 2>&1
```

Expected: FAIL — "Cannot find module '../cochrane'".

- [ ] **Step 3.3: Implement cochrane.ts**

Create `src/lib/cochrane.ts`:

```typescript
import { Source } from './types'
import { fetchPubMedByQuery } from './pubmed'

export async function searchCochrane(query: string): Promise<Source[]> {
  try {
    const cochraneTerm = `${query} AND "Cochrane Database Syst Rev"[Journal]`
    const articles = await fetchPubMedByQuery(cochraneTerm, 2)
    return articles.map(a => ({
      ...a,
      url: `https://pubmed.ncbi.nlm.nih.gov/${a.id}/`,
      source: 'Cochrane' as const,
      evidenceTier: 'Systematic Review' as const,
    }))
  } catch (err) {
    console.error('Cochrane fetch error:', err)
    return []
  }
}
```

- [ ] **Step 3.4: Run tests to confirm they pass**

```bash
cd /Users/mebeon/dev/bogus-claim-check/healthcheck && npx vitest run src/lib/__tests__/cochrane.test.ts --reporter verbose 2>&1
```

Expected: All 3 tests PASS.

- [ ] **Step 3.5: Commit**

```bash
cd /Users/mebeon/dev/bogus-claim-check/healthcheck
git add src/lib/cochrane.ts src/lib/__tests__/cochrane.test.ts
git commit -m "feat: add Cochrane search via PubMed journal filter"
```

---

### Task 4: Build whoiris.ts

**Files:**
- Create: `src/lib/whoiris.ts`
- Create: `src/lib/__tests__/whoiris.test.ts`

WHO IRIS runs DSpace 7. The discovery endpoint is `https://iris.who.int/server/api/discover/search/objects`. Results are labelled `source: 'WHO'` with `evidenceTier: 'Expert Consensus'`. If the endpoint returns a non-2xx status or throws, the function returns `[]`.

- [ ] **Step 4.1: Write the failing test**

Create `src/lib/__tests__/whoiris.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchWhoIris } from '../whoiris'

const mockFetch = vi.fn()
global.fetch = mockFetch as typeof fetch

describe('searchWhoIris', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls the WHO IRIS discovery endpoint with the query', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        _embedded: { searchResult: { _embedded: { objects: [] } } },
      }),
    } as Response)

    await searchWhoIris('vitamin D depression')

    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('iris.who.int')
    expect(url).toContain('vitamin')
  })

  it('maps WHO IRIS objects to the Source shape', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        _embedded: {
          searchResult: {
            _embedded: {
              objects: [
                {
                  _embedded: {
                    indexableObject: {
                      uuid: 'who-uuid-1',
                      metadata: {
                        'dc.title': [{ value: 'WHO Report on Vitamin D and Mental Health' }],
                        'dc.contributor.author': [{ value: 'WHO Expert Panel' }, { value: 'Smith J' }],
                        'dc.date.issued': [{ value: '2022-06-01' }],
                        'dc.description.abstract': [{ value: 'This report examines the evidence for vitamin D.' }],
                        'dc.identifier.uri': [{ value: 'https://iris.who.int/handle/10665/99999' }],
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      }),
    } as Response)

    const results = await searchWhoIris('vitamin D')

    expect(results).toHaveLength(1)
    expect(results[0].source).toBe('WHO')
    expect(results[0].evidenceTier).toBe('Expert Consensus')
    expect(results[0].id).toBe('who-uuid-1')
    expect(results[0].title).toBe('WHO Report on Vitamin D and Mental Health')
    expect(results[0].authors).toEqual(['WHO Expert Panel', 'Smith J'])
    expect(results[0].year).toBe(2022)
    expect(results[0].abstract).toBe('This report examines the evidence for vitamin D.')
    expect(results[0].url).toBe('https://iris.who.int/handle/10665/99999')
    expect(results[0].journal).toBe('WHO IRIS')
  })

  it('returns empty array on non-ok HTTP response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 } as Response)
    const results = await searchWhoIris('vitamin D')
    expect(results).toEqual([])
  })

  it('returns empty array on network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    const results = await searchWhoIris('vitamin D')
    expect(results).toEqual([])
  })
})
```

- [ ] **Step 4.2: Run test to confirm it fails**

```bash
cd /Users/mebeon/dev/bogus-claim-check/healthcheck && npx vitest run src/lib/__tests__/whoiris.test.ts --reporter verbose 2>&1
```

Expected: FAIL — "Cannot find module '../whoiris'".

- [ ] **Step 4.3: Implement whoiris.ts**

Create `src/lib/whoiris.ts`:

```typescript
import { Source } from './types'

const WHO_IRIS_BASE = 'https://iris.who.int/server/api/discover/search/objects'
const MAX_RESULTS = 2

interface WhoIrisMetadata {
  'dc.title'?: { value: string }[]
  'dc.contributor.author'?: { value: string }[]
  'dc.date.issued'?: { value: string }[]
  'dc.description.abstract'?: { value: string }[]
  'dc.identifier.uri'?: { value: string }[]
}

interface WhoIrisIndexableObject {
  uuid: string
  metadata: WhoIrisMetadata
}

interface WhoIrisObject {
  _embedded?: {
    indexableObject?: WhoIrisIndexableObject
  }
}

export async function searchWhoIris(query: string): Promise<Source[]> {
  try {
    const url = `${WHO_IRIS_BASE}?query=${encodeURIComponent(query)}&sort=score,DESC&size=${MAX_RESULTS}`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return []

    const data = await res.json()
    const objects: WhoIrisObject[] = data?._embedded?.searchResult?._embedded?.objects ?? []

    return objects
      .map((obj): Source | null => {
        const item = obj?._embedded?.indexableObject
        if (!item?.metadata) return null

        const meta = item.metadata
        const title = meta['dc.title']?.[0]?.value ?? 'Untitled'
        const authors = (meta['dc.contributor.author'] ?? []).slice(0, 3).map(a => a.value)
        const dateStr = meta['dc.date.issued']?.[0]?.value ?? '0'
        const year = parseInt(dateStr.split('-')[0]) || 0
        const abstract = (meta['dc.description.abstract']?.[0]?.value ?? 'Abstract not available.').slice(0, 600)
        const sourceUrl = meta['dc.identifier.uri']?.[0]?.value ?? 'https://iris.who.int/'

        return {
          id: item.uuid,
          title,
          authors,
          journal: 'WHO IRIS',
          year,
          abstract,
          url: sourceUrl,
          source: 'WHO',
          evidenceTier: 'Expert Consensus',
        }
      })
      .filter((s): s is Source => s !== null)
  } catch (err) {
    console.error('WHO IRIS fetch error:', err)
    return []
  }
}
```

- [ ] **Step 4.4: Run tests to confirm they pass**

```bash
cd /Users/mebeon/dev/bogus-claim-check/healthcheck && npx vitest run src/lib/__tests__/whoiris.test.ts --reporter verbose 2>&1
```

Expected: All 4 tests PASS.

- [ ] **Step 4.5: Commit**

```bash
cd /Users/mebeon/dev/bogus-claim-check/healthcheck
git add src/lib/whoiris.ts src/lib/__tests__/whoiris.test.ts
git commit -m "feat: add WHO IRIS search via DSpace 7 discovery API"
```

---

### Task 5: Update route.ts for parallel search + deduplication

**Files:**
- Modify: `src/app/api/check/route.ts`

Run all three searches with `Promise.all`. Deduplicate by `id`: Cochrane results are placed first so they win over PubMed for the same PMID (Cochrane reviews carry a more specific source label).

- [ ] **Step 5.1: Replace route.ts**

Replace the full content of `src/app/api/check/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { extractAndValidateClaim, generateVerdict } from '@/lib/pipeline'
import { searchPubMed } from '@/lib/pubmed'
import { searchCochrane } from '@/lib/cochrane'
import { searchWhoIris } from '@/lib/whoiris'
import { CheckResponse, Source } from '@/lib/types'

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

    const { isHealthClaim, extractedClaim, searchQuery, reason } = await extractAndValidateClaim(claim.trim())

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

    const [pubmedSources, cochraneSources, whoSources] = await Promise.all([
      searchPubMed(searchQuery),
      searchCochrane(searchQuery),
      searchWhoIris(searchQuery),
    ])

    // Cochrane results take precedence over PubMed for the same PMID
    const seenIds = new Set<string>()
    const sources: Source[] = []
    for (const source of [...cochraneSources, ...pubmedSources, ...whoSources]) {
      if (!seenIds.has(source.id)) {
        seenIds.add(source.id)
        sources.push(source)
      }
    }

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

- [ ] **Step 5.2: Run all tests**

```bash
cd /Users/mebeon/dev/bogus-claim-check/healthcheck && npx vitest run --reporter verbose 2>&1
```

Expected: All tests PASS (pubmed: 3, cochrane: 3, whoiris: 4 = 10 total).

- [ ] **Step 5.3: Commit**

```bash
cd /Users/mebeon/dev/bogus-claim-check/healthcheck
git add src/app/api/check/route.ts
git commit -m "feat: run PubMed, Cochrane, and WHO IRIS searches in parallel"
```

---

### Task 6: End-to-end smoke test

**Files:** none

- [ ] **Step 6.1: Confirm the dev server is running on port 3000**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

Expected: `200`. If not, run `npm run dev` in the healthcheck directory.

- [ ] **Step 6.2: Submit a claim and check the source mix in the response**

```bash
curl -s -X POST http://localhost:3000/api/check \
  -H "Content-Type: application/json" \
  -d '{"claim": "Vitamin D deficiency is linked to depression"}' \
  | python3 -m json.tool | grep '"source"'
```

Expected: At minimum `"source": "PubMed"` and `"source": "Cochrane"` appear. `"source": "WHO"` may also appear if WHO IRIS returns results for this query.

- [ ] **Step 6.3: Verify source badges in the browser UI**

Open http://localhost:3000. Submit the claim "Vitamin D deficiency is linked to depression". The source cards in the result should show labels like `PubMed → Read full paper ↗` and `Cochrane → Read full paper ↗` (and `WHO → Read full paper ↗` if WHO IRIS returned results). These labels come from `source.source` in `VerdictCard.tsx` and require no UI changes.
