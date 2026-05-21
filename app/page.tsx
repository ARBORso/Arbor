'use client'
import React from 'react'
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
          Where thinking blossoms into being.
        </p>
      </div>

      <div style={{ width: '100%', maxWidth: '600px' }}>
        <label style={{ display: 'block', color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', fontSize: '0.7rem', letterSpacing: '0.15em', marginBottom: '1rem', textTransform: 'uppercase' }}>
          Phase 1 — Seed your inquiry
        </label>
        
        <textarea
          value={seed}
          onChange={e => setSeed(e.target.value)}
          placeholder="State your seed problem in one sentence..."
          rows={3}
          style={{
            width: '100%',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            padding: '1.25rem 1.5rem',
            color: 'var(--text-primary)',
            fontFamily: 'Cormorant Garamond, Georgia, serif',
            fontSize: '1.1rem',
            lineHeight: '1.6',
            resize: 'none',
            outline: 'none',
            transition: 'border-color 0.2s',
          }}
          onFocus={e => e.target.style.borderColor = 'var(--accent-dim)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleStart() } }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
          
            href="/tree"
            style={{ color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', fontSize: '0.7rem', letterSpacing: '0.1em', textDecoration: 'none' }}
          >
            VIEW THE TREE →
          </a>
          
          <button
            onClick={handleStart}
            disabled={!seed.trim() || loading}
            style={{
              background: seed.trim() && !loading ? 'var(--accent)' : 'var(--bg-card)',
              color: seed.trim() && !loading ? 'var(--bg)' : 'var(--text-muted)',
              border: '1px solid ' + (seed.trim() && !loading ? 'var(--accent)' : 'var(--border)'),
              borderRadius: '3px',
              padding: '0.6rem 1.5rem',
              fontFamily: 'DM Mono, monospace',
              fontSize: '0.7rem',
              letterSpacing: '0.12em',
              cursor: seed.trim() && !loading ? 'pointer' : 'default',
              transition: 'all 0.2s',
            }}
          >
            {loading ? 'SEEDING...' : 'BEGIN SESSION'}
          </button>
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: '600px', marginTop: '4rem', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
        {[
          { phase: '01', label: 'Seed', desc: 'You state a problem. The AI reframes it.' },
          { phase: '02', label: 'Exchange', desc: '5 moves each — Extend, Challenge, or Pivot.' },
          { phase: '03', label: 'Crystallize', desc: 'Distil a Node. Leave one question open.' },
        ].map(item => (
          <div key={item.phase} style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>
              {item.phase}
            </div>
            <div style={{ color: 'var(--accent)', fontSize: '0.95rem', marginBottom: '0.4rem' }}>{item.label}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.5' }}>{item.desc}</div>
          </div>
        ))}
      </div>
    </main>
  )
}
