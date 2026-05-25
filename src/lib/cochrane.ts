import { Source } from './types'
import { fetchPubMedByQuery } from './pubmed'

export async function searchCochrane(query: string): Promise<Source[]> {
  try {
    const cochraneTerm = `${query} AND "Cochrane Database Syst Rev"[Journal]`
    const articles = await fetchPubMedByQuery(cochraneTerm, 2)
    return articles.map(a => ({
      ...a,
      url: `https://pubmed.ncbi.nlm.nih.gov/${a.id}/`,
      source: 'Cochrane' as const,
      evidenceTier: 'Systematic Review' as const,
    }))
  } catch (err) {
    console.error('Cochrane fetch error:', err)
    return []
  }
}
