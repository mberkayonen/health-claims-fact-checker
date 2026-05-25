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
