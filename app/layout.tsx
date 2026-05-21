import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Arbor — Where thinking blossoms into being',
  description: 'A game of collaborative thought where human-AI pairs grow a tree of insights.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
