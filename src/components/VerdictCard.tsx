'use client'

import { Verdict, VerdictLabel } from '@/lib/types'

const VERDICT_CONFIG: Record<VerdictLabel, {
  bg: string
  border: string
  text: string
  dot: string
  label: string
  description: string
}> = {
  'Supported': {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-800',
    dot: 'bg-emerald-500',
    label: 'Supported by evidence',
    description: 'The available research supports this claim.',
  },
  'Contested': {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-800',
    dot: 'bg-amber-500',
    label: 'Evidence is contested',
    description: 'Research findings are mixed or conflicting.',
  },
  'Contradicted': {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-800',
    dot: 'bg-red-500',
    label: 'Contradicted by evidence',
    description: 'Research does not support this claim.',
  },
  'Insufficient Evidence': {
    bg: 'bg-stone-100',
    border: 'border-stone-300',
    text: 'text-stone-700',
    dot: 'bg-stone-400',
    label: 'Insufficient evidence',
    description: 'Not enough research exists to make a determination.',
  },
  'Established Science': {
    bg: 'bg-teal-50',
    border: 'border-teal-200',
    text: 'text-teal-800',
    dot: 'bg-teal-500',
    label: 'Established science',
    description: 'This is foundational biology or medicine — not a contested research question.',
  },
}

const TIER_ORDER = ['Systematic Review', 'Clinical Trial', 'Observational Study', 'Expert Consensus', 'Unknown']

function EvidenceTierBadge({ tier }: { tier: string }) {
  const tierIndex = TIER_ORDER.indexOf(tier)
  const strength = tierIndex === 0 ? 'Highest quality' : tierIndex === 1 ? 'High quality' : tierIndex === 2 ? 'Moderate quality' : 'Lower quality'
  const colors = tierIndex === 0
    ? 'bg-emerald-100 text-emerald-700'
    : tierIndex === 1
    ? 'bg-blue-100 text-blue-700'
    : tierIndex === 2
    ? 'bg-amber-100 text-amber-700'
    : 'bg-stone-100 text-stone-600'

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded-full ${colors}`}>
      {tier} · {strength}
    </span>
  )
}

export default function VerdictCard({ verdict }: { verdict: Verdict }) {
  const config = VERDICT_CONFIG[verdict.label]

  return (
    <div className="space-y-6">
      {/* Extracted claim */}
      <div className="animate-fade-slide-up">
        <p className="text-xs font-mono text-stone-400 uppercase tracking-widest mb-2">Claim assessed</p>
        <p className="text-stone-600 text-sm leading-relaxed border-l-2 border-stone-200 pl-3 italic">
          "{verdict.extractedClaim}"
        </p>
      </div>

      {/* Verdict badge */}
      <div className={`animate-fade-slide-up-delay-1 rounded-2xl border ${config.bg} ${config.border} p-5`}>
        <div className="flex items-center gap-3 mb-3">
          <span className={`w-2.5 h-2.5 rounded-full ${config.dot} flex-shrink-0`} />
          <span className={`font-display text-xl ${config.text}`}>{config.label}</span>
        </div>
        <p className="text-stone-700 leading-relaxed">{verdict.explanation}</p>
        {verdict.context && (
          <p className="text-sm text-teal-700 mt-2 italic">{verdict.context}</p>
        )}
      </div>

      {/* Evidence quality */}
      <div className="animate-fade-slide-up-delay-2">
        <p className="text-xs font-mono text-stone-400 uppercase tracking-widest mb-2">Evidence quality</p>
        <p className="text-stone-600 text-sm">{verdict.evidenceSummary}</p>
      </div>

      {/* Caveats */}
      {verdict.caveats && (
        <div className="animate-fade-slide-up-delay-2 bg-amber-50 border border-amber-100 rounded-xl p-4">
          <p className="text-xs font-mono text-amber-600 uppercase tracking-widest mb-1.5">⚠ Important caveats</p>
          <p className="text-amber-900 text-sm leading-relaxed">{verdict.caveats}</p>
        </div>
      )}

      {/* Consensus note — shown when peer-reviewed sources were sparse */}
      {verdict.consensusNote && (
        <div className="animate-fade-slide-up-delay-2 bg-stone-50 border border-stone-200 rounded-xl p-4">
          <p className="text-xs font-mono text-stone-500 uppercase tracking-widest mb-1.5">Scientific consensus context</p>
          <p className="text-stone-600 text-sm leading-relaxed">{verdict.consensusNote}</p>
          <p className="text-xs text-stone-400 mt-2 font-mono">Not from retrieved peer-reviewed sources.</p>
        </div>
      )}

      {/* Sources — hidden for Established Science verdicts which have no citations */}
      {verdict.sources.length > 0 && (
        <div className="animate-fade-slide-up-delay-3">
          <p className="text-xs font-mono text-stone-400 uppercase tracking-widest mb-3">
            Sources consulted ({verdict.sources.length})
          </p>
          <div className="space-y-3">
            {verdict.sources.map((source, i) => (
              <a
                key={source.id}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block border border-stone-200 rounded-xl p-4 hover:border-stone-400 hover:bg-white transition-all duration-200 group"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <span className="font-mono text-xs text-stone-400">#{i + 1}</span>
                  <EvidenceTierBadge tier={source.evidenceTier} />
                </div>
                <p className="text-stone-800 text-sm font-medium leading-snug mb-1 group-hover:text-stone-900">
                  {source.title}
                </p>
                <p className="text-xs text-stone-400 font-mono mb-2">
                  {source.journal} · {source.year}
                  {source.authors.length > 0 && ` · ${source.authors.slice(0, 2).join(', ')}${source.authors.length > 2 ? ' et al.' : ''}`}
                </p>
                {source.abstract && source.abstract !== 'Abstract not available.' && (
                  <p className="text-xs text-stone-500 leading-relaxed line-clamp-3">
                    {source.abstract}
                  </p>
                )}
                <p className="text-xs text-stone-400 mt-2 font-mono group-hover:text-stone-600 transition-colors">
                  {source.source} → Read full paper ↗
                </p>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Transparency footer */}
      <div className="animate-fade-slide-up-delay-3 border-t border-stone-200 pt-4">
        <p className="text-xs text-stone-400 leading-relaxed">
          {verdict.sources.length > 0
            ? 'This verdict is generated by AI and grounded only in the sources listed above from PubMed/MEDLINE, Cochrane Database, and WHO IRIS.'
            : 'This verdict is generated by AI based on established scientific consensus.'}
          {' '}It is not medical advice. Always consult a healthcare professional for personal health decisions.
        </p>
      </div>
    </div>
  )
}
