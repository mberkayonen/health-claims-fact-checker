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
