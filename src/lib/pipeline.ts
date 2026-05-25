import Anthropic from '@anthropic-ai/sdk'
import { Source, Verdict, VerdictLabel } from './types'

const client = new Anthropic()

function stripMarkdownJson(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
}

// Step 1: validate this is a health claim and extract the core assertion
export async function extractAndValidateClaim(userInput: string): Promise<{
  isHealthClaim: boolean
  extractedClaim: string
  searchQueries: string[]
  reason?: string
}> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `You are a claim analysis assistant. Your job is to determine if the following input contains a health or medical claim, and if so, extract it cleanly.

A health claim is any assertion about:
- Effects of food, drink, supplements, or substances on the body
- Disease prevention, treatment, or causes
- Exercise, sleep, or lifestyle effects on health
- Medical procedures or treatments
- Mental health interventions
- Nutritional science

User input: "${userInput}"

Respond ONLY with a JSON object, no markdown:
{
  "isHealthClaim": true/false,
  "extractedClaim": "the core falsifiable claim in one clear sentence, or empty string if not a health claim",
  "searchQueries": [
    "specific MeSH/clinical PubMed query using MeSH terms where appropriate",
    "broader synonym-based query covering alternative terminology for the same concept",
    "guideline or recommendation-focused query (e.g. including terms like guidelines, recommendations, consensus)"
  ],
  "reason": "if not a health claim, briefly explain why"
}`
    }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  try {
    const parsed = JSON.parse(stripMarkdownJson(text))
    if (!Array.isArray(parsed.searchQueries)) {
      parsed.searchQueries = parsed.searchQuery ? [parsed.searchQuery] : []
    }
    return parsed
  } catch {
    return { isHealthClaim: false, extractedClaim: '', searchQueries: [], reason: 'Could not parse claim.' }
  }
}

export const MIN_SOURCES_FOR_VERDICT = 3

// Step 2: generate verdict from retrieved sources
export async function generateVerdict(
  extractedClaim: string,
  sources: Source[]
): Promise<Verdict> {
  const sourcesContext = sources.map((s, i) => `
SOURCE ${i + 1}:
Title: ${s.title}
Journal: ${s.journal} (${s.year})
Evidence tier: ${s.evidenceTier}
Abstract: ${s.abstract}
URL: ${s.url}
`).join('\n---\n')

  const validAbstractCount = sources.filter(s => s.abstract !== 'Abstract not available.').length
  const sparseEvidence = validAbstractCount < MIN_SOURCES_FOR_VERDICT

  const consensusFallbackInstruction = sparseEvidence
    ? `\nIf the retrieved sources are insufficient to reach a verdict, you MAY add a brief "consensusNote" drawing on well-established scientific consensus — but ONLY for claims where consensus is genuinely unambiguous and widely accepted. Clearly label it as not from the retrieved sources. If no clear consensus exists, set consensusNote to null.`
    : ''

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: `You are a scientific fact-checker. Your ONLY job is to assess health claims based strictly on the provided scientific sources.

CRITICAL RULES:
- You may ONLY use the provided sources. Do not use any other knowledge.
- If sources are insufficient, say so clearly.
- Never fabricate or embellish findings.
- Use plain, everyday language in explanations — avoid jargon.
- Be honest about uncertainty and limitations.
- Evidence tiers matter: Systematic Reviews > Clinical Trials > Observational Studies > Expert Consensus.${consensusFallbackInstruction}`,
    messages: [{
      role: 'user',
      content: `Assess this health claim based ONLY on the sources provided below.

CLAIM: "${extractedClaim}"

SOURCES:
${sourcesContext}

Respond ONLY with a JSON object, no markdown:
{
  "label": "Supported" | "Contested" | "Contradicted" | "Insufficient Evidence",
  "explanation": "2-3 sentences in plain everyday language explaining what the evidence shows. No jargon. Write as if explaining to a friend.",
  "evidenceSummary": "1 sentence describing the quality and quantity of evidence (e.g. 'Based on two randomized controlled trials and one systematic review')",
  "caveats": "Important limitations, caveats, or context the reader should know — or null if none",
  "consensusNote": "Brief plain-language note on scientific consensus if sources were insufficient — or null",
  "sourceIndices": [list of source index numbers (1-based) that were actually relevant to the verdict]
}`
    }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  let parsed: {
    label: VerdictLabel
    explanation: string
    evidenceSummary: string
    caveats: string | null
    consensusNote: string | null
    sourceIndices: number[]
  }

  try {
    parsed = JSON.parse(stripMarkdownJson(text))
  } catch {
    parsed = {
      label: 'Insufficient Evidence',
      explanation: 'We were unable to generate a verdict for this claim.',
      evidenceSummary: 'No evidence assessed.',
      caveats: null,
      consensusNote: null,
      sourceIndices: [],
    }
  }

  if (parsed.label !== 'Insufficient Evidence' || !sparseEvidence) {
    parsed.consensusNote = null
  }

  const relevantSources = parsed.sourceIndices
    .map(i => sources[i - 1])
    .filter(Boolean)

  return {
    label: parsed.label,
    explanation: parsed.explanation,
    evidenceSummary: parsed.evidenceSummary,
    caveats: parsed.caveats ?? null,
    consensusNote: parsed.consensusNote ?? null,
    sources: relevantSources.length > 0 ? relevantSources : sources.slice(0, 3),
    extractedClaim,
  }
}
