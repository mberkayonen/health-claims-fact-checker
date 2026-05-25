# HealthCheck — Architecture & Pipeline Design

HealthCheck fact-checks health claims from social media against peer-reviewed science. This document explains the pipeline architecture, the design decisions behind it, and the trade-offs considered along the way.

---

## Overview

The core challenge: given a free-text claim like *"coffee causes cancer"*, return an evidence-based verdict that is transparent, honest, and grounded only in real sources — not in an LLM's training memory.

The solution is a **three-stage RAG pipeline**: extract the claim → retrieve evidence → assess and explain.

```
User input
    │
    ▼
┌─────────────────────┐
│  Stage 1: Extract   │  Claude validates the input is a health claim
│  (Claude call #1)   │  and generates an optimised search query
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Stage 2: Retrieve  │  Three sources searched in parallel:
│  (External APIs)    │  PubMed (general) + Cochrane (filtered) + WHO IRIS
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Stage 3: Assess    │  Claude reads the retrieved abstracts and
│  (Claude call #2)   │  produces a verdict grounded only in those sources
└────────┬────────────┘
         │
         ▼
    Verdict + Sources
```

---

## Stage 1 — Claim Extraction

**The problem:** Users paste unstructured text — sometimes a direct claim, sometimes a paragraph from an article, sometimes an opinion. The pipeline needs a clean, falsifiable assertion before it can search for anything.

**The solution:** A dedicated Claude call that does two things at once:
1. Validates the input is actually a health claim (not a recipe, not a question, not a personal story)
2. Extracts the core falsifiable assertion and converts it into an optimised PubMed search query

**Why a separate call for this?** Because mixing validation and evidence assessment in a single prompt creates ambiguity — if the input turns out to be off-topic, the model has already started reasoning about science. Separating concerns keeps each call focused and its output reliable.

**Out-of-scope inputs** are rejected at this stage with a specific explanation. This is intentional: a tool that accepts any input and produces a verdict is less trustworthy than one that knows its own limits.

---

## Stage 2 — Evidence Retrieval (Multi-Source RAG)

### Why RAG at all?

The alternative — asking Claude to assess a claim from its training knowledge — has a fundamental problem: you cannot verify where the answer came from or whether it's current. Training data has a cutoff, medical knowledge evolves, and hallucinations are indistinguishable from real citations.

RAG (Retrieval-Augmented Generation) solves this by separating *what we know* from *what we can verify*. Claude's role in Stage 3 is reduced to reading and reasoning about documents, not recalling facts. Every claim in the verdict can be traced back to a real, linkable source.

### Why three sources?

| Source | Why included | Access method |
|--------|-------------|---------------|
| **PubMed** | 35M+ biomedical papers; the primary index for medical research | NCBI E-utilities (free, no key) |
| **Cochrane** | Gold-standard systematic reviews; highest evidence tier | PubMed journal filter (`"Cochrane Database Syst Rev"[Journal]`) |
| **WHO IRIS** | WHO guidelines and reports; institutional expert consensus | DSpace 7 REST API (free, no key) |

Cochrane was not integrated via their native API (which requires OAuth) but by filtering PubMed — Cochrane reviews are indexed in PubMed. This gives a genuine Cochrane source label with zero additional authentication.

### Evidence tiering

Each source is labelled by study type before being passed to Claude:

```
Systematic Review  ▶  highest reliability
Clinical Trial     ▶  high reliability
Observational Study▶  moderate
Expert Consensus   ▶  lower (but important for guidelines)
Unknown            ▶  labelled honestly
```

This labelling is inferred from PubMed's `pubtype` field. Claude uses it to weight evidence — a systematic review of 20 trials outweighs a single observational study.

### Parallel search & deduplication

All three sources are fetched with `Promise.all()` — concurrent, not sequential. A Cochrane search on top of a serial PubMed search would add ~1–2 seconds per request with no benefit.

Because Cochrane reviews are indexed in both PubMed (as general results) and the Cochrane-filtered query (as Cochrane-labelled results), the same paper can appear twice. Deduplication by PMID resolves this, with Cochrane taking precedence — a paper that appears in both lists is shown as a Cochrane source, which is more informative.

### Graceful degradation

Each source module is wrapped in its own try/catch and returns an empty array on failure. If WHO IRIS is unreachable, PubMed and Cochrane still flow through. The pipeline never fails because one source timed out.

---

## Stage 3 — Evidence Assessment

**The critical constraint:** Claude is instructed to assess only from the retrieved sources — not from its training knowledge.

This is enforced in the system prompt:
> *"You may ONLY use the provided sources. Do not use any other knowledge."*

**Why is this important?** Without this constraint, Claude might produce a confident, well-written verdict that draws on training data rather than the retrieved abstracts. The verdict would look identical to a source-grounded one, but would be unverifiable and potentially outdated. The constraint trades some breadth for full traceability.

### Verdict labels

Four labels cover the full range of scientific evidence:

- **Supported** — retrieved sources consistently back the claim
- **Contested** — sources are mixed or conflicting
- **Contradicted** — sources argue against the claim
- **Insufficient Evidence** — not enough research to make a determination

`Insufficient Evidence` is a first-class result, not a failure state. Returning it honestly when evidence is sparse is more trustworthy than forcing a verdict.

### JSON output with markdown stripping

Claude returns structured JSON for the verdict. Newer Claude models sometimes wrap JSON in markdown code fences (` ```json ... ``` `) despite being instructed not to. The pipeline strips these before parsing, making the output format robust across model versions.

---

## Key Design Decisions

### One claim at a time

The pipeline processes a single claim per request. This forces precision — both in what the user submits and in what the pipeline assesses. A compound claim (*"coffee causes cancer and also prevents Alzheimer's"*) would produce a muddled verdict; splitting it into two checks produces two clear ones.

### No training data in verdicts

The most important guardrail in the system. The Stage 1 call is the only place Claude uses its own knowledge (to understand what a health claim is). Stage 3 is explicitly retrieval-only. This design decision significantly reduces hallucination risk in the output.

### Two Claude calls, not one

A single prompt combining extraction, search query generation, and verdict assessment would be harder to debug, harder to optimise, and would conflate failure modes. Keeping the calls separate means:
- Stage 1 failures (not a health claim) are caught before any search happens
- Stage 3 can be tuned independently without affecting extraction
- Each call has a clear, testable input/output contract

### Transparent sourcing

Every verdict includes the full list of sources with titles, journals, years, evidence tiers, and direct PubMed/WHO links. The user can verify every claim in the explanation. This is what separates a trustworthy fact-checker from a black box.

---

## Tech Stack Rationale

| Technology | Role | Why |
|-----------|------|-----|
| **Next.js 14** | Frontend + API routes | Single deployment, full-stack TypeScript, Vercel-native |
| **Claude (Sonnet)** | LLM for extraction and assessment | Strong instruction-following, reliable JSON output |
| **NCBI E-utilities** | PubMed search + abstract retrieval | Free, no key required for low volume, 35M+ papers |
| **WHO IRIS DSpace API** | WHO publications | Free, no key required, authoritative source |
| **Tailwind CSS** | UI styling | Rapid iteration, no CSS context-switching |
| **Vitest** | Unit testing | Fast, TypeScript-native, minimal config |

---

## Running Costs

At ~100 checks/month:
- **Anthropic API:** ~$2–5/month (two Claude calls per check, cached where possible)
- **PubMed / WHO IRIS:** Free
- **Vercel:** Free tier

---

## What This Demonstrates

This project was built as a learning exercise in LLM + RAG architecture. The decisions documented here — source-grounded assessment, multi-source retrieval, evidence tiering, graceful degradation — are patterns applicable to any domain where an LLM needs to reason over external, verifiable documents rather than its own training memory.
