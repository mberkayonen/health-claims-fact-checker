# Portfolio Website — Design Spec

**Date:** 2026-05-28
**Author:** M. Berkay Önen
**Repo:** https://github.com/mberkayonen/portfolio-website
**Target domain:** beronen.tech (already configured on Vercel)

---

## Purpose

A single-page scrollable portfolio website to accompany job applications for PM roles. Showcases personal AI projects built as learning exercises. Primary audience: recruiters and hiring managers at potential employers.

---

## Visual Design

- **Style:** Warm neutral — off-white base (`#fafaf9`), warm stone text (`#1c1917`), amber accent (`#d97706`)
- **Tech tag chips:** amber tint (`#fef3c7` background, `#92400e` text)
- **Cards:** white (`#fff`) with a subtle border (`#e7e5e4`) and minimal box shadow
- **Font:** system font stack (`Inter`, then `system-ui`, then sans-serif)
- **No dark mode** — light only

---

## Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Framework | Next.js 14 App Router | Same stack as existing projects; Vercel-native |
| Language | TypeScript | Type safety for project data shape |
| Styling | Tailwind CSS | Rapid iteration, consistent with existing projects |
| Markdown | `react-markdown` + `remark-gfm` | Handles tables, code blocks in READMEs |
| Hosting | Vercel | Domain already configured |
| README fetch | `raw.githubusercontent.com` (public) | No auth token needed |
| Data freshness | ISR `revalidate: 86400` | README stays current without manual redeploy |

No environment variables required. No API routes. No database.

---

## Page Structure

```
┌─────────────────────────────────────┐
│  NAVBAR (sticky)                    │
│  M. Berkay Önen        [LI] [GH]   │
├─────────────────────────────────────┤
│  HERO                               │
│  M. Berkay Önen                     │
│  Product Manager building with AI   │
├─────────────────────────────────────┤
│  PROJECTS                           │
│  ┌─────────────────────────────┐    │
│  │ Project card (see below)    │    │
│  └─────────────────────────────┘    │
│  (one card per project)             │
├─────────────────────────────────────┤
│  ABOUT                              │
│  Short paragraph                    │
├─────────────────────────────────────┤
│  FOOTER                             │
│  M. Berkay Önen · 2025              │
└─────────────────────────────────────┘
```

---

## Components

### `<Navbar>`
- Sticky, full-width, `z-index` above page content
- Left: name `M. Berkay Önen` in bold — links to `#` (scrolls to top)
- Right: LinkedIn SVG icon (links to `https://www.linkedin.com/in/berkayonen/`) and GitHub SVG icon (links to `https://github.com/mberkayonen`), both in muted stone color

### `<Hero>`
- `h1`: `M. Berkay Önen`
- Subtitle: `Product Manager building with AI`
- No image, no CTA button — text only

### `<ProjectCard>`
One card per project. All data comes from `src/data/projects.ts`.

**Collapsed state:**
- Top row: project name (left) + GitHub repo icon link (top-right)
- Short description (1–2 sentences)
- Tech stack chips (amber tint)
- Bottom row: "View Project" button → `liveUrl` (new tab) + "Read README" toggle (amber text)

**Expanded state (README):**
- README content rendered below the bottom row, separated by a top border
- Full markdown rendering — headings, lists, tables, code blocks
- "Collapse" replaces "Read README"; chevron icon rotates 180°
- Expand/collapse is client-side only (content already in HTML from ISR fetch)

**GitHub icon link:** links to `https://github.com/{repoOwner}/{repoName}`, opens in new tab

### `<About>`
- Section label: `ABOUT` (small caps, muted)
- One short paragraph of plain text (author-written, not generated)
- Max width `540px` for readability

### `<Footer>`
- Centered, muted: `M. Berkay Önen · 2026`

---

## Data Model

```ts
// src/data/projects.ts
export type Project = {
  name: string         // "HealthCheck"
  description: string  // 1–2 sentence summary shown collapsed
  liveUrl: string      // "https://claimcheck.beronen.tech"
  repoOwner: string    // "mberkayonen"
  repoName: string     // "health-claims-fact-checker"
  techStack: string[]  // ["Next.js 14", "Claude", "RAG", "PubMed API", "WHO IRIS"]
}

export const projects: Project[] = [
  {
    name: "HealthCheck",
    description:
      "Fact-checks health claims from social media against peer-reviewed science. Returns a transparent, sourced verdict in plain language.",
    liveUrl: "https://claimcheck.beronen.tech",
    repoOwner: "mberkayonen",
    repoName: "health-claims-fact-checker",
    techStack: ["Next.js 14", "Claude", "RAG", "PubMed API", "WHO IRIS"],
  },
]
```

Adding a new project = appending one object to this array. No other changes needed.

---

## README Fetching

README content is fetched at build time inside the page server component:

```ts
async function fetchReadme(owner: string, repo: string): Promise<string> {
  const res = await fetch(
    `https://raw.githubusercontent.com/${owner}/${repo}/main/README.md`,
    { next: { revalidate: 86400 } }
  )
  if (!res.ok) return ""
  return res.text()
}
```

- Falls back to empty string if the fetch fails — card still renders without README
- ISR means Vercel re-fetches every 24 hours in the background
- No loading state needed in the UI (content is server-rendered)

---

## File Structure

```
portfolio-website/
├── src/
│   ├── app/
│   │   ├── layout.tsx       # root layout, sets <html lang>, font, metadata
│   │   ├── page.tsx         # main page (server component, fetches READMEs)
│   │   └── globals.css      # Tailwind base imports
│   ├── components/
│   │   ├── Navbar.tsx
│   │   ├── Hero.tsx
│   │   ├── ProjectCard.tsx  # client component (expand/collapse state)
│   │   └── About.tsx
│   └── data/
│       └── projects.ts
├── public/
├── tailwind.config.ts
├── next.config.ts
├── tsconfig.json
└── package.json
```

---

## Deployment

- GitHub repo: `mberkayonen/portfolio-website`
- Connect repo to Vercel (import project)
- Add custom domain in Vercel dashboard (already configured)
- No environment variables needed
- Auto-deploys on every push to `main`

---

## Out of Scope

- Contact form
- Analytics
- Dark mode
- Search or filtering
- Authentication
