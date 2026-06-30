import { NextRequest, NextResponse } from 'next/server'
import { extractAndValidateClaim, generateVerdict, generateEstablishedVerdict } from '@/lib/pipeline'
import { searchPubMed } from '@/lib/pubmed'
import { searchCochrane } from '@/lib/cochrane'
import { searchWhoIris } from '@/lib/whoiris'
import { deduplicateSources } from '@/lib/sources'
import { CheckResponse, Source } from '@/lib/types'
import { createLangfuseClient } from '@/lib/langfuse'

export const maxDuration = 60

// Fan out across 3 sources × N queries in parallel, then dedup.
// Order within each group is [PubMed, Cochrane, WHO] so the i % 3 split
// below correctly separates them. Cochrane listed first in the merge so
// deduplicateSources gives it precedence over PubMed for the same PMID.
async function runLiteratureSearch(searchQueries: string[]): Promise<Source[]> {
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
}

export async function POST(req: NextRequest): Promise<NextResponse<CheckResponse>> {
  const { claim, sessionId } = await req.json().catch(() => ({ claim: null, sessionId: undefined }))

  const lf = createLangfuseClient()
  const trace = lf?.trace({ name: 'check-claim', sessionId, input: { claim } }) ?? null

  try {
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
      await extractAndValidateClaim(claim.trim(), trace)

    if (!isHealthClaim) {
      trace?.update({ output: { isHealthClaim: false, reason } })
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
          generateEstablishedVerdict(extractedClaim, trace),
          runLiteratureSearch(searchQueries),
        ])

        if (verdictSettled.status === 'rejected') throw verdictSettled.reason

        const furtherReadingSources = sourcesSettled.status === 'fulfilled'
          ? sourcesSettled.value
          : []
        if (sourcesSettled.status === 'rejected') {
          console.error('Further reading search failed for established claim:', sourcesSettled.reason)
        }

        const verdict = { ...verdictSettled.value, sources: furtherReadingSources }
        trace?.update({ output: { label: verdict.label } })
        return NextResponse.json({ success: true, verdict })
      } catch (err) {
        console.error('Established verdict failed, falling back to research pipeline:', err)
        // fall through to research pipeline below
      }
    }

    // Research path
    const sources = await runLiteratureSearch(searchQueries)
    const verdict = await generateVerdict(extractedClaim, sources, trace)

    trace?.update({ output: { label: verdict.label, sourceCount: verdict.sources.length } })
    return NextResponse.json({ success: true, verdict })
  } catch (err) {
    console.error('Check API error:', err)
    trace?.update({ output: { error: 'internal error' } })
    return NextResponse.json(
      { success: false, error: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  } finally {
    await lf?.flushAsync().catch(err => console.error('[Langfuse] flush failed:', err))
  }
}
