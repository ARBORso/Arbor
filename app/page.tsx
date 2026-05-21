'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const [seed, setSeed] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleStart = async () => {
    if (!seed.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed_problem: seed.trim() })
      })
      const session = await res.json()
      router.push(`/session/${session.id}`)
    } catch (e) {
      setLoading(false)
    }
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      
      <div style={{ marginBottom: '3rem', textAlign: 'center' }}>
        <svg width="48" height="56" viewBox="0 0 48 56" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginBottom: '1.5rem' }}>
          <line x1="24" y1="56" x2="24" y2="28" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="4 3"/>
          <line x1="24" y1="28" x2="8" y2="12" stroke="var(--accent)" strokeWidth="1.5"/>
          <line x1="24" y1="28" x2="40" y2="12" stroke="var(--accent)" strokeWidth="1.5"/>
          <line x1="24" y1="20" x2="14" y2="8" stroke="var(--accent-dim)" strokeWidth="1"/>
          <line x1="24" y1="20" x2="34" y2="8" stroke="var(--accent-dim)" strokeWidth="1"/>
          <circle cx="24" cy="28" r="3" fill="var(--accent)"/>
          <circle cx="8" cy="12" r="2" fill="var(--accent-dim)"/>
          <circle cx="40" cy="12" r="2" fill="var(--accent-dim)"/>
          <circle cx="14" cy="8" r="1.5" fill="var(--text-muted)"/>
          <circle cx="34" cy="8" r="1.5" fill="var(--text-muted)"/>
        </svg>
        
        <h1 style={{ fontSize: '3.5rem', fontWeight: 300, letterSpacing: '0.2em', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
          ARBOR
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '1.1rem', letterSpacing: '0.05em' }}>
          Where thin
