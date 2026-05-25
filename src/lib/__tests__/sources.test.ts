import { describe, it, expect } from 'vitest'
import { deduplicateSources } from '../sources'
import type { Source } from '../types'

function makeSource(id: string, sourceLabel: Source['source']): Source {
  return {
    id,
    title: `Title ${id}`,
    authors: [],
    journal: 'Test Journal',
    year: 2020,
    abstract: 'Some abstract text.',
    url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
    source: sourceLabel,
    evidenceTier: 'Unknown',
  }
}

describe('deduplicateSources', () => {
  it('keeps all sources when there are no duplicate IDs', () => {
    const sources = [makeSource('1', 'PubMed'), makeSource('2', 'Cochrane'), makeSource('3', 'WHO')]
    expect(deduplicateSources(sources)).toHaveLength(3)
  })

  it('removes the second occurrence of a duplicate ID', () => {
    const sources = [
      makeSource('42', 'Cochrane'),
      makeSource('42', 'PubMed'),
    ]
    const result = deduplicateSources(sources)
    expect(result).toHaveLength(1)
    expect(result[0].source).toBe('Cochrane')
  })

  it('gives Cochrane precedence over PubMed for the same PMID when Cochrane appears first', () => {
    const sources = [
      makeSource('10', 'Cochrane'),
      makeSource('10', 'PubMed'),
      makeSource('11', 'PubMed'),
    ]
    const result = deduplicateSources(sources)
    expect(result).toHaveLength(2)
    expect(result[0].source).toBe('Cochrane')
    expect(result[0].id).toBe('10')
    expect(result[1].id).toBe('11')
  })

  it('preserves WHO sources even when they share an ID with a PubMed source', () => {
    const sources = [
      makeSource('who-doc-1', 'WHO'),
      makeSource('pubmed-1', 'PubMed'),
    ]
    const result = deduplicateSources(sources)
    expect(result).toHaveLength(2)
  })

  it('returns an empty array for empty input', () => {
    expect(deduplicateSources([])).toEqual([])
  })
})
