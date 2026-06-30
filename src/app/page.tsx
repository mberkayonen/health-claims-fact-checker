'use client'

import { useState } from 'react'
import { CheckResponse } from '@/lib/types'
import VerdictCard from '@/components/VerdictCard'

const EXAMPLE_CLAIMS = [
  "Coffee causes cancer",
  "Vitamin D deficiency is linked to depression",
  "Eating red meat every day increases heart disease risk",
  "Intermittent fasting improves insulin sensitivity",
]

type State = 'idle' | 'loading' | 'result' | 'error'

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-3 w-24 loading-shimmer rounded mb-3" />
        <div className="h-4 w-3/4 loading-shimmer rounded" />
      </div>
      <div className="rounded-2xl border border-stone-200 p-5 space-y-3">
        <div className="h-6 w-48 loading-shimmer rounded" />
        <div className="h-4 w-full loading-shimmer rounded" />
        <div className="h-4 w-5/6 loading-shimmer rounded" />
      </div>
      <div>
        <div className="h-3 w-32 loading-shimmer rounded mb-3" />
        <div className="h-4 w-2/3 loading-shimmer rounded" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="border border-stone-200 rounded-xl p-4 space-y-2">
            <div className="h-3 w-full loading-shimmer rounded" />
            <div className="h-3 w-4/5 loading-shimmer rounded" />
            <div className="h-3 w-24 loading-shimmer rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

function getOrCreateSessionId(): string {
  const key = 'hc_session_id'
  const existing = sessionStorage.getItem(key)
  if (existing) return existing
  const id = crypto.randomUUID()
  sessionStorage.setItem(key, id)
  return id
}

export default function HomePage() {
  const [claim, setClaim] = useState('')
  const [state, setState] = useState<State>('idle')
  const [response, setResponse] = useState<CheckResponse | null>(null)
  const [charCount, setCharCount] = useState(0)

  const handleSubmit = async () => {
    if (!claim.trim() || claim.trim().length < 10) return
    setState('loading')
    setResponse(null)

    try {
      const res = await fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim: claim.trim(), sessionId: getOrCreateSessionId() }),
      })
      const data: CheckResponse = await res.json()
      setResponse(data)
      setState(data.success ? 'result' : 'error')
    } catch {
      setResponse({ success: false, error: 'Network error. Please try again.' })
      setState('error')
    }
  }

  const handleReset = () => {
    setState('idle')
    setResponse(null)
    setClaim('')
    setCharCount(0)
  }

  const handleExample = (example: string) => {
    setClaim(example)
    setCharCount(example.length)
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="border-b border-stone-200 bg-white">
        <div className="max-w-2xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-stone-900 flex items-center justify-center">
              <span className="text-white text-xs font-mono font-medium">Hc</span>
            </div>
            <span className="font-display text-lg text-stone-900">HealthCheck</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-stone-400 bg-stone-100 px-2.5 py-1 rounded-full">
              PubMed · Cochrane · WHO
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="mb-10">
          <h1 className="font-display text-4xl text-stone-900 leading-tight mb-3">
            Does the science<br />back it up?
          </h1>
          <p className="text-stone-500 text-lg leading-relaxed">
            Paste a health claim from social media. We'll check it against
            peer-reviewed research — transparently, with sources.
          </p>
        </div>

        {/* Input area */}
        {state !== 'result' && (
          <div className="bg-white rounded-2xl border border-stone-200 p-6 mb-6 shadow-sm">
            <label className="block text-xs font-mono text-stone-400 uppercase tracking-widest mb-3">
              Health claim
            </label>
            <textarea
              value={claim}
              onChange={e => {
                setClaim(e.target.value)
                setCharCount(e.target.value.length)
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit()
              }}
              placeholder={'e.g. "Studies show that drinking coffee every day prevents Alzheimer\'s disease."'}
              className="w-full bg-transparent text-stone-800 placeholder:text-stone-300 text-base leading-relaxed resize-none min-h-[100px] font-body focus:outline-none"
              maxLength={500}
              disabled={state === 'loading'}
            />
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-stone-100">
              <span className={`text-xs font-mono ${charCount > 450 ? 'text-amber-500' : 'text-stone-300'}`}>
                {charCount}/500
              </span>
              <button
                onClick={handleSubmit}
                disabled={claim.trim().length < 10 || state === 'loading'}
                className="bg-stone-900 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-stone-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 active:scale-95"
              >
                {state === 'loading' ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Checking...
                  </span>
                ) : (
                  'Check claim →'
                )}
              </button>
            </div>
          </div>
        )}

        {/* Example claims */}
        {state === 'idle' && (
          <div className="mb-8">
            <p className="text-xs font-mono text-stone-400 uppercase tracking-widest mb-3">Try an example</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_CLAIMS.map(example => (
                <button
                  key={example}
                  onClick={() => handleExample(example)}
                  className="text-sm text-stone-600 bg-white border border-stone-200 px-3 py-1.5 rounded-lg hover:border-stone-400 hover:bg-stone-50 transition-all duration-150"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* How it works */}
        {state === 'idle' && (
          <div className="border border-stone-200 rounded-2xl p-6 bg-white">
            <p className="text-xs font-mono text-stone-400 uppercase tracking-widest mb-4">How it works</p>
            <div className="space-y-3">
              {[
                ['01', 'Extract', 'We identify the core falsifiable health assertion in your input.'],
                ['02', 'Search', 'We query PubMed\'s 35M+ biomedical papers for relevant research.'],
                ['03', 'Assess', 'An AI reads the retrieved abstracts and determines what the science says.'],
                ['04', 'Explain', 'You get a plain-language verdict with full sources — no black box.'],
              ].map(([num, step, desc]) => (
                <div key={num} className="flex gap-4 items-start">
                  <span className="font-mono text-xs text-stone-300 pt-0.5 w-6 flex-shrink-0">{num}</span>
                  <div>
                    <span className="text-sm font-medium text-stone-700">{step} </span>
                    <span className="text-sm text-stone-400">{desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading state */}
        {state === 'loading' && (
          <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
            <p className="text-xs font-mono text-stone-400 uppercase tracking-widest mb-6">
              Checking your claim against the evidence...
            </p>
            <LoadingSkeleton />
          </div>
        )}

        {/* Error state */}
        {state === 'error' && response && (
          <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
            <div className={`rounded-xl p-4 mb-6 ${
              response.isHealthClaim === false
                ? 'bg-stone-100 border border-stone-200'
                : 'bg-red-50 border border-red-100'
            }`}>
              <p className={`text-sm leading-relaxed ${
                response.isHealthClaim === false ? 'text-stone-600' : 'text-red-700'
              }`}>
                {response.isHealthClaim === false ? '🔍 ' : '⚠ '}
                {response.error}
              </p>
            </div>
            <button
              onClick={handleReset}
              className="text-sm text-stone-500 hover:text-stone-800 transition-colors font-mono"
            >
              ← Try another claim
            </button>
          </div>
        )}

        {/* Result state */}
        {state === 'result' && response?.verdict && (
          <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <p className="text-xs font-mono text-stone-400 uppercase tracking-widest">Results</p>
              <button
                onClick={handleReset}
                className="text-xs font-mono text-stone-400 hover:text-stone-700 transition-colors"
              >
                ← Check another
              </button>
            </div>
            <VerdictCard verdict={response.verdict} />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-2xl mx-auto px-6 py-8 border-t border-stone-200 mt-12">
        <p className="text-xs text-stone-400 font-mono">
          HealthCheck is a portfolio project demonstrating LLM + RAG. Sources: PubMed/MEDLINE (NCBI).
          Not medical advice.
        </p>
      </footer>
    </div>
  )
}
