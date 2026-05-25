export type VerdictLabel = 'Supported' | 'Contested' | 'Contradicted' | 'Insufficient Evidence'

export interface Source {
  id: string
  title: string
  authors: string[]
  journal: string
  year: number
  abstract: string
  url: string
  source: 'PubMed' | 'Cochrane' | 'WHO'
  evidenceTier: 'Systematic Review' | 'Clinical Trial' | 'Observational Study' | 'Expert Consensus' | 'Unknown'
}

export interface Verdict {
  label: VerdictLabel
  explanation: string
  evidenceSummary: string
  caveats: string | null
  sources: Source[]
  extractedClaim: string
}

export interface CheckResponse {
  success: boolean
  verdict?: Verdict
  error?: string
  isHealthClaim?: boolean
}
