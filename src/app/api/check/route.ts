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
