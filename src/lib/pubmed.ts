import { Source } from './types'

const PUBMED_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'

interface PubMedArticle {
  title: string
  authors: { name: string }[]
  source: string
  pubdate: string
  fulljournalname: string
  pubtype: string[]
}

export interface RawPubMedArticle {
  id: string
  title: string
  authors: string[]
  journal: string
  year: number
  abstract: string
  pubtype: string[]
}

function inferEvidenceTier(pubtypes: string[]): Source['evidenceTier'] {
  const types = pubtypes.map(t => t.toLowerCase())
  if (types.some(t => t.includes('systematic') || t.includes('meta-analysis'))) return 'Systematic Review'
  if (types.some(t => t.includes('randomized') || t.includes('clinical trial') || t.includes('controlled'))) return 'Clinical Trial'
  if (types.some(t => t.includes('observational') || t.includes('cohort') || t.includes('case'))) return 'Observational Study'
  if (types.some(t => t.includes('review') || t.includes('consensus') || t.includes('guideline'))) return 'Expert Consensus'
  return 'Unknown'
}

export async function fetchPubMedByQuery(query: string, maxResults: number): Promise<RawPubMedArticle[]> {
  const searchUrl = `${PUBMED_BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query + ' AND hasabstract[text]')}&retmax=${maxResults}&retmode=json&sort=relevance`
  const searchRes = await fetch(searchUrl)
  const searchData = await searchRes.json()
  const ids: string[] = searchData?.esearchresult?.idlist ?? []

  if (ids.length === 0) return []

  const summaryUrl = `${PUBMED_BASE}/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`
  const summaryRes = await fetch(summaryUrl)
  const summaryData = await summaryRes.json()
  const result = summaryData?.result ?? {}

  const fetchUrl = `${PUBMED_BASE}/efetch.fcgi?db=pubmed&id=${ids.join(',')}&retmode=xml&rettype=abstract`
  const fetchRes = await fetch(fetchUrl)
  const xmlText = await fetchRes.text()

  const abstractMap: Record<string, string> = {}
  const articleBlocks = xmlText.split(/<PubmedArticle[>\s]/)
  articleBlocks.forEach(block => {
    const idMatch = block.match(/<PMID[^>]*>(\d+)<\/PMID>/)
    if (!idMatch) return
    const id = idMatch[1]
    const abstractMatches = block.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)
    if (abstractMatches) {
      abstractMap[id] = abstractMatches
        .map(m => m.replace(/<[^>]+>/g, ''))
        .join(' ')
        .slice(0, 600)
    }
  })

  return ids
    .filter(id => result[id] && result[id].title)
    .map((id): RawPubMedArticle => {
      const article: PubMedArticle = result[id]
      const year = parseInt(article.pubdate?.split(' ')[0] ?? '0') || 0
      return {
        id,
        title: article.title ?? 'Untitled',
        authors: (article.authors ?? []).slice(0, 3).map((a: { name: string }) => a.name),
        journal: article.fulljournalname ?? article.source ?? 'Unknown journal',
        year,
        abstract: abstractMap[id] ?? 'Abstract not available.',
        pubtype: article.pubtype ?? [],
      }
    })
}

export async function searchPubMed(query: string): Promise<Source[]> {
  try {
    const articles = await fetchPubMedByQuery(query, 8)
    return articles.map(a => ({
      ...a,
      url: `https://pubmed.ncbi.nlm.nih.gov/${a.id}/`,
      source: 'PubMed' as const,
      evidenceTier: inferEvidenceTier(a.pubtype),
    }))
  } catch (err) {
    console.error('PubMed fetch error:', err)
    return []
  }
}
