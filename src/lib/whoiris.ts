import { Source } from './types'

const WHO_IRIS_BASE = 'https://iris.who.int/server/api/discover/search/objects'
const MAX_RESULTS = 2

interface WhoIrisMetadata {
  'dc.title'?: { value: string }[]
  'dc.contributor.author'?: { value: string }[]
  'dc.date.issued'?: { value: string }[]
  'dc.description.abstract'?: { value: string }[]
  'dc.identifier.uri'?: { value: string }[]
}

interface WhoIrisIndexableObject {
  uuid: string
  metadata: WhoIrisMetadata
}

interface WhoIrisObject {
  _embedded?: {
    indexableObject?: WhoIrisIndexableObject
  }
}

export async function searchWhoIris(query: string): Promise<Source[]> {
  try {
    const url = `${WHO_IRIS_BASE}?query=${encodeURIComponent(query)}&sort=score,DESC&size=${MAX_RESULTS}`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return []

    const data = await res.json()
    const objects: WhoIrisObject[] = data?._embedded?.searchResult?._embedded?.objects ?? []

    return objects
      .map((obj): Source | null => {
        const item = obj?._embedded?.indexableObject
        if (!item?.metadata) return null

        const meta = item.metadata
        const title = meta['dc.title']?.[0]?.value ?? 'Untitled'
        const authors = (meta['dc.contributor.author'] ?? []).slice(0, 3).map(a => a.value)
        const dateStr = meta['dc.date.issued']?.[0]?.value ?? '0'
        const year = parseInt(dateStr.split('-')[0]) || 0
        const abstract = (meta['dc.description.abstract']?.[0]?.value ?? 'Abstract not available.').slice(0, 600)
        const sourceUrl = meta['dc.identifier.uri']?.[0]?.value ?? 'https://iris.who.int/'

        return {
          id: item.uuid,
          title,
          authors,
          journal: 'WHO IRIS',
          year,
          abstract,
          url: sourceUrl,
          source: 'WHO',
          evidenceTier: 'Expert Consensus',
        }
      })
      .filter((s): s is Source => s !== null)
  } catch (err) {
    console.error('WHO IRIS fetch error:', err)
    return []
  }
}
