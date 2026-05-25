import { Source } from './types'

export function deduplicateSources(sources: Source[]): Source[] {
  const seen = new Set<string>()
  const result: Source[] = []
  for (const source of sources) {
    if (!seen.has(source.id)) {
      seen.add(source.id)
      result.push(source)
    }
  }
  return result
}
