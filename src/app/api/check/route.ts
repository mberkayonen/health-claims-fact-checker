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
