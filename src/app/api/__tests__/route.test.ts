import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '../check/route'

const mockExtractAndValidateClaim = vi.hoisted(() => vi.fn())
const mockGenerateEstablishedVerdict = vi.hoisted(() => vi.fn())
const mockGenerateVerdict = vi.hoisted(() => vi.fn())
const mockSearchPubMed = vi.hoisted(() => vi.fn())
const mockSearchCochrane = vi.hoisted(() => vi.fn())
const mockSearchWhoIris = vi.hoisted(() => vi.fn())
const mockDeduplicateSources = vi.hoisted(() => vi.fn())

vi.mock('@/lib/pipeline', () => ({
  extractAndValidateClaim: mockExtractAndValidateClaim,
  generateEstablishedVerdict: mockGenerateEstablishedVerdict,
  generateVerdict: mockGenerateVerdict,
}))

vi.mock('@/lib/pubmed', () => ({ searchPubMed: mockSearchPubMed }))
vi.mock('@/lib/cochrane', () => ({ searchCochrane: mockSearchCochrane }))
vi.mock('@/lib/whoiris', () => ({ searchWhoIris: mockSearchWhoIris }))
vi.mock('@/lib/sources', () => ({ deduplicateSources: mockDeduplicateSources }))

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/check', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/check', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

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

  it('falls back to research pipeline when generateEstablishedVerdict throws', async () => {
    mockExtractAndValidateClaim.mockResolvedValueOnce({
      isHealthClaim: true,
      claimType: 'established',
      extractedClaim: 'Humans need water',
      searchQueries: ['water physiology'],
    })

    mockGenerateEstablishedVerdict.mockRejectedValueOnce(new Error('Claude API error'))

    const sources = [{ id: '1', title: 'Study', authors: [], journal: 'Nature', year: 2020, abstract: 'Abstract', url: 'http://x.com', source: 'PubMed' as const, evidenceTier: 'Clinical Trial' as const }]
    mockSearchPubMed.mockResolvedValue(sources)
    mockSearchCochrane.mockResolvedValue([])
    mockSearchWhoIris.mockResolvedValue([])
    mockDeduplicateSources.mockReturnValue(sources)

    const fallbackVerdict = {
      label: 'Supported' as const,
      explanation: 'Evidence supports this.',
      evidenceSummary: 'One clinical trial.',
      caveats: null,
      consensusNote: null,
      context: null,
      sources,
      extractedClaim: 'Humans need water',
    }
    mockGenerateVerdict.mockResolvedValueOnce(fallbackVerdict)

    const res = await POST(makeRequest({ claim: 'humans need water' }))
    const body = await res.json()

    expect(body.success).toBe(true)
    expect(mockGenerateVerdict).toHaveBeenCalled()
    expect(mockSearchPubMed).toHaveBeenCalled()
  })
})
