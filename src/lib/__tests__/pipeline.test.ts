import { vi, describe, it, expect } from 'vitest'

const mockCreate = vi.hoisted(() => vi.fn())

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({
    messages: { create: mockCreate },
  })),
}))

import { extractAndValidateClaim, generateVerdict, generateEstablishedVerdict } from '../pipeline'
import type { Source } from '../types'

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
})

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

  it('nulls out consensusNote when the verdict label is not Insufficient Evidence', async () => {
    const sources = [makeSource('30', NO_ABSTRACT), makeSource('31', NO_ABSTRACT)]

    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          label: 'Supported',
          explanation: 'Evidence supports this.',
          evidenceSummary: 'Based on two studies.',
          caveats: null,
          consensusNote: 'Some unexpected consensus note from Claude.',
          sourceIndices: [1],
        }),
      }],
    })

    const result = await generateVerdict('Some claim', sources)

    expect(result.label).toBe('Supported')
    expect(result.consensusNote).toBeNull()
  })

  it('nulls out consensusNote when evidence is not sparse, even if label is Insufficient Evidence', async () => {
    const sources = [
      makeSource('40', REAL_ABSTRACT),
      makeSource('41', REAL_ABSTRACT),
      makeSource('42', REAL_ABSTRACT),
    ]

    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          label: 'Insufficient Evidence',
          explanation: 'The evidence is inconclusive.',
          evidenceSummary: 'Based on three studies.',
          caveats: null,
          consensusNote: 'Claude tried to sneak this in despite adequate sources.',
          sourceIndices: [1, 2, 3],
        }),
      }],
    })

    const result = await generateVerdict('Some well-studied claim', sources)

    expect(result.consensusNote).toBeNull()
  })
})

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
