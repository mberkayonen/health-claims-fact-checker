# Portfolio Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a single-page portfolio website at beronen.tech showcasing M. Berkay Önen's AI projects.

**Architecture:** Next.js 14 App Router single-page site. A server component fetches README content from GitHub at build time (ISR, revalidated every 24h). ProjectCard is a client component that handles the expand/collapse toggle. Project data lives in a single typed config file — adding a new project means appending one object.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, @tailwindcss/typography, react-markdown, remark-gfm, Vitest, @testing-library/react, Vercel

---

## File Map

**Created:**
- `src/data/projects.ts` — typed `Project` array; the only file to edit when adding a project
- `src/lib/fetchReadme.ts` — async utility, fetches README from GitHub raw URL with ISR
- `src/lib/__tests__/fetchReadme.test.ts` — unit tests for fetchReadme
- `src/components/Navbar.tsx` — sticky nav, name + LinkedIn/GitHub icon links
- `src/components/Hero.tsx` — name + tagline
- `src/components/ProjectCard.tsx` — `'use client'`, expand/collapse state, markdown render
- `src/components/__tests__/ProjectCard.test.tsx` — tests for card behavior
- `src/components/About.tsx` — about section at page bottom
- `src/test/setup.ts` — jest-dom global setup
- `vitest.config.ts` — Vitest config with jsdom + path alias

**Modified:**
- `src/app/layout.tsx` — metadata, font, `bg-stone-50`
- `src/app/page.tsx` — server component, fetches READMEs, assembles page
- `src/app/globals.css` — Tailwind directives + `scroll-behavior: smooth`
- `tailwind.config.ts` — add `@tailwindcss/typography` plugin
- `package.json` — add `test` and `test:watch` scripts

---

## Task 1: Clone repo and scaffold Next.js project

**Files:**
- Create: `portfolio-website/` (entire project root)

- [ ] **Step 1: Clone the repo**

```bash
cd ~/dev
git clone https://github.com/mberkayonen/portfolio-website.git
cd portfolio-website
```

- [ ] **Step 2: Scaffold Next.js inside the cloned repo**

```bash
npx create-next-app@14 . \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --no-eslint \
  --import-alias "@/*" \
  --use-npm
```

When prompted about overwriting existing files (`README.md`, `.gitignore`), type `y`.

- [ ] **Step 3: Install additional dependencies**

```bash
npm install react-markdown remark-gfm @tailwindcss/typography
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 4: Verify the dev server starts**

```bash
npm run dev
```

Expected: `Ready in Xs` on port 3000. Open http://localhost:3000 — should show the default Next.js welcome page. Stop with `ctrl+c`.

- [ ] **Step 5: Commit scaffold**

```bash
git add -A
git commit -m "chore: scaffold Next.js 14 project with Tailwind and TypeScript"
```

---

## Task 2: Configure Vitest

**Files:**
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Modify: `package.json`

- [ ] **Step 1: Create vitest.config.ts**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 2: Create test setup file**

```ts
// src/test/setup.ts
import '@testing-library/jest-dom'
```

- [ ] **Step 3: Add test scripts to package.json**

In `package.json`, update the `"scripts"` section:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 4: Verify Vitest runs (no tests yet)**

```bash
npm test
```

Expected: `No test files found` or exits with code 0. Not an error.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts src/test/setup.ts package.json
git commit -m "chore: configure Vitest with jsdom and Testing Library"
```

---

## Task 3: Configure Tailwind and global CSS

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Update tailwind.config.ts**

Replace the entire contents of `tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [require('@tailwindcss/typography')],
}

export default config
```

- [ ] **Step 2: Replace globals.css**

Replace the entire contents of `src/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html {
  scroll-behavior: smooth;
}
```

- [ ] **Step 3: Commit**

```bash
git add tailwind.config.ts src/app/globals.css
git commit -m "chore: add Tailwind typography plugin and smooth scroll"
```

---

## Task 4: Project data model

**Files:**
- Create: `src/data/projects.ts`

- [ ] **Step 1: Create the data file**

```ts
// src/data/projects.ts
export type Project = {
  name: string
  description: string
  liveUrl: string
  repoOwner: string
  repoName: string
  techStack: string[]
}

export const projects: Project[] = [
  {
    name: 'HealthCheck',
    description:
      'Fact-checks health claims from social media against peer-reviewed science. Returns a transparent, sourced verdict in plain language.',
    liveUrl: 'https://claimcheck.beronen.tech',
    repoOwner: 'mberkayonen',
    repoName: 'health-claims-fact-checker',
    techStack: ['Next.js 14', 'Claude', 'RAG', 'PubMed API', 'WHO IRIS'],
  },
]
```

- [ ] **Step 2: Commit**

```bash
git add src/data/projects.ts
git commit -m "feat: add Project type and initial HealthCheck entry"
```

---

## Task 5: fetchReadme utility + tests

**Files:**
- Create: `src/lib/fetchReadme.ts`
- Create: `src/lib/__tests__/fetchReadme.test.ts`

- [ ] **Step 1: Write failing tests first**

```ts
// src/lib/__tests__/fetchReadme.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchReadme } from '../fetchReadme'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchReadme', () => {
  it('returns the README text when fetch succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('# My Project\n\nThis is the readme.'),
    }))

    const result = await fetchReadme('mberkayonen', 'some-repo')

    expect(result).toBe('# My Project\n\nThis is the readme.')
    expect(fetch).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/mberkayonen/some-repo/main/README.md',
      { next: { revalidate: 86400 } }
    )
  })

  it('returns empty string when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      text: () => Promise.resolve(''),
    }))

    const result = await fetchReadme('mberkayonen', 'missing-repo')

    expect(result).toBe('')
  })

  it('returns empty string when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const result = await fetchReadme('mberkayonen', 'some-repo')

    expect(result).toBe('')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test
```

Expected: 3 tests fail with `Cannot find module '../fetchReadme'`.

- [ ] **Step 3: Create fetchReadme.ts**

```ts
// src/lib/fetchReadme.ts
export async function fetchReadme(owner: string, repo: string): Promise<string> {
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${owner}/${repo}/main/README.md`,
      { next: { revalidate: 86400 } }
    )
    if (!res.ok) return ''
    return res.text()
  } catch {
    return ''
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fetchReadme.ts src/lib/__tests__/fetchReadme.test.ts
git commit -m "feat: add fetchReadme utility with ISR and graceful fallback"
```

---

## Task 6: Navbar component

**Files:**
- Create: `src/components/Navbar.tsx`

- [ ] **Step 1: Create Navbar.tsx**

```tsx
// src/components/Navbar.tsx
export default function Navbar() {
  return (
    <nav className="sticky top-0 z-10 bg-stone-50 border-b border-stone-200">
      <div className="max-w-2xl mx-auto px-8 h-14 flex items-center justify-between">
        <a
          href="#"
          className="text-sm font-bold text-stone-900 tracking-tight hover:text-stone-600 transition-colors"
        >
          M. Berkay Önen
        </a>
        <div className="flex items-center gap-5">
          <a
            href="https://www.linkedin.com/in/berkayonen/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn profile"
            className="text-stone-400 hover:text-stone-700 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
          </a>
          <a
            href="https://github.com/mberkayonen"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub profile"
            className="text-stone-400 hover:text-stone-700 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
            </svg>
          </a>
        </div>
      </div>
    </nav>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Navbar.tsx
git commit -m "feat: add Navbar with LinkedIn and GitHub icon links"
```

---

## Task 7: Hero component

**Files:**
- Create: `src/components/Hero.tsx`

- [ ] **Step 1: Create Hero.tsx**

```tsx
// src/components/Hero.tsx
export default function Hero() {
  return (
    <section className="pt-16 pb-14">
      <h1 className="text-4xl font-extrabold text-stone-900 tracking-tight mb-2">
        M. Berkay Önen
      </h1>
      <p className="text-base text-stone-500">
        Product Manager building with AI
      </p>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Hero.tsx
git commit -m "feat: add Hero component"
```

---

## Task 8: ProjectCard component + tests

**Files:**
- Create: `src/components/ProjectCard.tsx`
- Create: `src/components/__tests__/ProjectCard.test.tsx`

- [ ] **Step 1: Write failing tests first**

```tsx
// src/components/__tests__/ProjectCard.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ProjectCard from '../ProjectCard'
import type { Project } from '@/data/projects'

const project: Project = {
  name: 'HealthCheck',
  description: 'Fact-checks health claims against peer-reviewed science.',
  liveUrl: 'https://claimcheck.beronen.tech',
  repoOwner: 'mberkayonen',
  repoName: 'health-claims-fact-checker',
  techStack: ['Next.js 14', 'Claude'],
}

describe('ProjectCard', () => {
  it('renders project name, description, and tech tags', () => {
    render(<ProjectCard project={project} readme="" />)

    expect(screen.getByText('HealthCheck')).toBeInTheDocument()
    expect(screen.getByText('Fact-checks health claims against peer-reviewed science.')).toBeInTheDocument()
    expect(screen.getByText('Next.js 14')).toBeInTheDocument()
    expect(screen.getByText('Claude')).toBeInTheDocument()
  })

  it('does not render README area when collapsed', () => {
    render(<ProjectCard project={project} readme="# Hello" />)

    expect(screen.queryByRole('region', { name: /readme/i })).not.toBeInTheDocument()
    expect(screen.getByText('Read README')).toBeInTheDocument()
  })

  it('shows README content after clicking Read README', () => {
    render(<ProjectCard project={project} readme="# Hello world" />)

    fireEvent.click(screen.getByText('Read README'))

    expect(screen.getByText('Hello world')).toBeInTheDocument()
    expect(screen.getByText('Collapse')).toBeInTheDocument()
  })

  it('hides README content after clicking Collapse', () => {
    render(<ProjectCard project={project} readme="# Hello world" />)

    fireEvent.click(screen.getByText('Read README'))
    fireEvent.click(screen.getByText('Collapse'))

    expect(screen.queryByText('Hello world')).not.toBeInTheDocument()
    expect(screen.getByText('Read README')).toBeInTheDocument()
  })

  it('links View Project to the live URL', () => {
    render(<ProjectCard project={project} readme="" />)

    const link = screen.getByText('View Project').closest('a')
    expect(link).toHaveAttribute('href', 'https://claimcheck.beronen.tech')
  })

  it('links the GitHub icon to the repo URL', () => {
    render(<ProjectCard project={project} readme="" />)

    const link = screen.getByLabelText('GitHub repository')
    expect(link).toHaveAttribute('href', 'https://github.com/mberkayonen/health-claims-fact-checker')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test
```

Expected: 6 tests fail with `Cannot find module '../ProjectCard'`.

- [ ] **Step 3: Create ProjectCard.tsx**

```tsx
// src/components/ProjectCard.tsx
'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Project } from '@/data/projects'

type Props = {
  project: Project
  readme: string
}

export default function ProjectCard({ project, readme }: Props) {
  const [expanded, setExpanded] = useState(false)

  return (
    <article className="bg-white border border-stone-200 rounded-xl p-6 shadow-sm">
      <div className="flex justify-between items-start mb-3">
        <h2 className="text-lg font-bold text-stone-900">{project.name}</h2>
        <a
          href={`https://github.com/${project.repoOwner}/${project.repoName}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub repository"
          className="text-stone-300 hover:text-stone-600 transition-colors ml-4 flex-shrink-0"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
          </svg>
        </a>
      </div>

      <p className="text-sm text-stone-600 leading-relaxed mb-4">{project.description}</p>

      <div className="flex flex-wrap gap-2 mb-5">
        {project.techStack.map((tag) => (
          <span
            key={tag}
            className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded font-medium"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <a
          href={project.liveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 bg-stone-900 text-stone-50 text-xs font-semibold px-4 py-2 rounded-lg hover:bg-stone-700 transition-colors"
        >
          View Project
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path d="M7 17L17 7M17 7H7M17 7v10" />
          </svg>
        </a>

        {readme && (
          <button
            onClick={() => setExpanded((prev) => !prev)}
            className="text-xs text-amber-600 font-semibold flex items-center gap-1 hover:text-amber-700 transition-colors"
          >
            {expanded ? 'Collapse' : 'Read README'}
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
              style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        )}
      </div>

      {expanded && readme && (
        <div className="mt-5 pt-5 border-t border-stone-200">
          <div className="prose prose-stone prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{readme}</ReactMarkdown>
          </div>
        </div>
      )}
    </article>
  )
}
```

- [ ] **Step 4: Run tests — verify all pass**

```bash
npm test
```

Expected: all 9 tests pass (3 fetchReadme + 6 ProjectCard).

- [ ] **Step 5: Commit**

```bash
git add src/components/ProjectCard.tsx src/components/__tests__/ProjectCard.test.tsx
git commit -m "feat: add ProjectCard with README expand/collapse and tests"
```

---

## Task 9: About component

**Files:**
- Create: `src/components/About.tsx`

- [ ] **Step 1: Create About.tsx**

Write your own text in place of the placeholder before deploying.

```tsx
// src/components/About.tsx
export default function About() {
  return (
    <section className="pt-8 pb-12 border-t border-stone-200">
      <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-3">
        About
      </p>
      <p className="text-sm text-stone-600 leading-relaxed max-w-xl">
        {/* Write your own text here before deploying */}
        I&apos;m a Product Manager who builds small AI products to develop sharper instincts
        for the decisions that come with them — what to trust, what to scope, what to ship.
        This page documents that work.
      </p>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/About.tsx
git commit -m "feat: add About section"
```

---

## Task 10: Layout and page assembly

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Update layout.tsx**

```tsx
// src/app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'M. Berkay Önen',
  description: 'Product Manager building with AI',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-stone-50 min-h-screen`}>
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Update page.tsx**

```tsx
// src/app/page.tsx
import { projects } from '@/data/projects'
import { fetchReadme } from '@/lib/fetchReadme'
import Navbar from '@/components/Navbar'
import Hero from '@/components/Hero'
import ProjectCard from '@/components/ProjectCard'
import About from '@/components/About'

export default async function Home() {
  const projectsWithReadme = await Promise.all(
    projects.map(async (project) => ({
      ...project,
      readme: await fetchReadme(project.repoOwner, project.repoName),
    }))
  )

  return (
    <main>
      <Navbar />
      <div className="max-w-2xl mx-auto px-8">
        <Hero />
        <section className="mb-16">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-5">
            Projects
          </p>
          <div className="space-y-4">
            {projectsWithReadme.map((project) => (
              <ProjectCard
                key={project.repoName}
                project={project}
                readme={project.readme}
              />
            ))}
          </div>
        </section>
        <About />
      </div>
      <footer className="border-t border-stone-200 py-4 text-center mt-8">
        <p className="text-xs text-stone-400">M. Berkay Önen · 2026</p>
      </footer>
    </main>
  )
}
```

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: all 9 tests pass.

- [ ] **Step 4: Start dev server and verify visually**

```bash
npm run dev
```

Open http://localhost:3000 and verify:
- Navbar is sticky; name on left, LinkedIn and GitHub icons on right
- Hero shows "M. Berkay Önen" and "Product Manager building with AI"
- HealthCheck card shows description and amber tech tags
- "Read README" expands the card with rendered markdown (headings, lists, tables)
- "Collapse" hides the README area
- "View Project" opens `claimcheck.beronen.tech` in a new tab
- GitHub icon in the card top-right opens the repo in a new tab
- About section appears below the projects
- Footer shows "M. Berkay Önen · 2026"

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/app/page.tsx
git commit -m "feat: assemble full page — navbar, hero, projects, about, footer"
```

---

## Task 11: Deploy to Vercel

**Files:** none (Vercel configuration via dashboard)

- [ ] **Step 1: Push all commits to GitHub**

```bash
git push origin main
```

- [ ] **Step 2: Import the project on Vercel**

1. Go to https://vercel.com/new
2. Click "Import Git Repository"
3. Select `mberkayonen/portfolio-website`
4. Framework preset auto-detects as Next.js — leave all defaults
5. No environment variables needed
6. Click "Deploy"

- [ ] **Step 3: Connect custom domain**

1. In the Vercel project dashboard → Settings → Domains
2. Add `beronen.tech` (or whatever subdomain you want to use)
3. Follow Vercel's DNS instructions to point the domain

- [ ] **Step 4: Verify production**

Open the live domain and run through the same checklist as Task 10 Step 4.
