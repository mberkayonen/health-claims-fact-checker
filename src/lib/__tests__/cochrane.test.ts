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
