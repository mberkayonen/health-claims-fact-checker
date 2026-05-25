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
