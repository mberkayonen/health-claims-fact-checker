# HealthCheck

**Fact-check health claims against peer-reviewed science.**

Paste a health claim from social media — HealthCheck searches PubMed's 35M+ biomedical papers and returns a transparent, sourced verdict in plain language.

Live demo: [your-vercel-url.vercel.app]

---

## How it works

1. **Claim extraction** — Claude identifies the core falsifiable health assertion in your input and validates it's a health claim (not a recipe, opinion, etc.)
2. **PubMed search** — The extracted claim is converted into an optimized search query and fired against NCBI's E-utilities API
3. **Evidence assessment** — Claude reads the retrieved abstracts and determines what the science actually says, grounded only in retrieved sources
4. **Transparent verdict** — Returns a labelled verdict (Supported / Contested / Contradicted / Insufficient Evidence) with plain-language explanation, evidence quality summary, caveats, and full source links

## Tech stack

- **Frontend**: Next.js 14 + Tailwind CSS
- **LLM**: Anthropic Claude (claude-sonnet-4-20250514)
- **Data source**: PubMed / NCBI E-utilities API (free, no key required)
- **Hosting**: Vercel (free tier)

## Design decisions

- **Health claims only** — Out-of-scope inputs are rejected gracefully. Keeps the tool focused and trustworthy.
- **One claim at a time** — Forces precision in both the user's input and the pipeline's output.
- **No training data for verdicts** — Claude is explicitly instructed to assess only from retrieved sources, not its own knowledge. Reduces hallucination risk significantly.
- **Evidence tier labelling** — Sources are labelled by study type (Systematic Review > Clinical Trial > Observational Study). Users can see how strong the evidence base is.
- **Honest uncertainty** — "Insufficient Evidence" is a first-class verdict, not a failure state.

## Local development

```bash
# 1. Clone and install
git clone [your-repo]
cd healthcheck
npm install

# 2. Set up environment
cp .env.example .env.local
# Add your ANTHROPIC_API_KEY to .env.local

# 3. Run dev server
npm run dev
# Open http://localhost:3000
```

## Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Add your environment variable in Vercel dashboard:
# ANTHROPIC_API_KEY = your key
```

Or connect your GitHub repo to Vercel for automatic deployments.

## Estimated running costs

At low traffic (~100 checks/month):
- Anthropic API: ~$2–5/month (two Claude calls per check)
- Vercel: Free tier
- PubMed API: Free
- **Total: ~$2–5/month**

## Roadmap

- [ ] Add Cochrane Reviews API
- [ ] Add WHO IRIS search
- [ ] Source confidence scoring
- [ ] Claim history / shareable links
- [ ] Browser extension for checking claims in-context

## Disclaimer

HealthCheck is a portfolio project demonstrating LLM + RAG architecture. Verdicts are AI-generated and should not be used as medical advice. Always consult a qualified healthcare professional for personal health decisions.
