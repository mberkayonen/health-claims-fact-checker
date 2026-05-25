import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'HealthCheck — Fact-check health claims against science',
  description: 'Paste a health claim from social media and we\'ll check it against peer-reviewed research from PubMed, Cochrane, and WHO.',
  openGraph: {
    title: 'HealthCheck',
    description: 'Fact-check health claims against peer-reviewed science.',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-stone-50 text-stone-900 antialiased">
        {children}
      </body>
    </html>
  )
}
