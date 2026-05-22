'use client'
import React, { useState, useEffect } from 'react'

export default function SeedPage() {
  const [seed, setSeed] = useState('')
  const [loading, setLoading] = useState(false)
  const [parentId, setParentId] = useState<string | null>(null)
  const [parentMoveId, setParentMoveId] = useState<string | null>(null)
  const [parentSessionId, setParentSessionId] = useState<string | null>(null)
  const [branchType, setBranchType] = useState<string | null>(null)
  const [context, setContext] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setParentId(params.get('parent'))
    setParentMoveId(params.get('parent_move'))
    setParentSessionId(params.get('parent_session'))
    setBranchType(params.get('branch_type'))
    setContext(params.get('context'))
  }, [])

  const isMoveB ranch = !!parentMoveId

  const MOVE_COLORS: Record<string, string> = {
    extend: '#6e9e8a',
    challenge: '#9e6e6e',
    pivot: '#7a6e9e',
  }

  const MOVE_SYMBOLS: Record<string, string> = {
    extend: '→',
    challenge: '↔',
    pivot: '↑',
  }

  const handleStart = async () => {
    if (!seed.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seed_problem: seed.trim(),
          parent_node_id: parentId || parentSessionId || null,
          parent_move_id: parentMoveId || null,
          branch_type: branchType || null,
        })
      })
      const session = await res.json()
      window.location.href = `/session/${session.id}`
    } catch (e) {
      setLoading(false)
    }
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ marginBottom: '2rem', textAlign: 'center', width: '100%', maxWidth: '600px' }}>
        <a href="/" style={{ color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', fontSize: '0.65rem', letterSpacing: '0.1em', textDecoration: 'none' }}>← ARBOR</a>

        {isMoveBranch && context && branchType && (
          <div style={{ marginTop: '1.5rem', padding: '1rem 1.25rem', background: 'var(--bg-card)', border: `1px solid ${MOVE_COLORS[branchType] || 'var(--border)'}44`, borderRadius: '4px', textAlign: 'left' }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.58rem', color: MOVE_COLORS[branchType] || 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
              {MOVE_SYMBOLS[branchType]} BRANCHING FROM MOVE · {branchType.toUpperCase()}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.88rem', lineHeight: '1.5' }}>
              "{context}{context.length >= 100 ? '...' : ''}"
            </div>
          </div>
        )}

        <h1 style={{ fontSize: '2rem', fontWeight: 300, letterSpacing: '0.15em', color: 'var(--text-primary)', marginTop: '1.5rem' }}>
          {isMoveBranch ? 'BRANCH FROM MOVE' : parentId ? 'BRANCH FROM NODE' : 'SEED YOUR INQUIRY'}
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.95rem', marginTop: '0.5rem' }}>
          {isMoveBranch
            ? 'What new inquiry does this thought open?'
            : parentId ? 'Continue the thinking from a new angle.'
            : 'State your problem in one sentence.'}
        </p>
      </div>

      <div style={{ width: '100%', maxWidth: '600px' }}>
        <textarea
          value={seed}
          onChange={e => setSeed(e.target.value)}
          placeholder="State your seed problem in one sentence..."
          rows={3}
          autoFocus
          style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '4px', padding: '1.25rem 1.5rem', color: 'var(--text-primary)', fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '1.1rem', lineHeight: '1.6', resize: 'none', outline: 'none' }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleStart() } }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button
            onClick={handleStart}
            disabled={!seed.trim() || loading}
            style={{ background: seed.trim() && !loading ? 'var(--accent)' : 'var(--bg-card)', color: seed.trim() && !loading ? 'var(--bg)' : 'var(--text-muted)', border: '1px solid ' + (seed.trim() && !loading ? 'var(--accent)' : 'var(--border)'), borderRadius: '3px', padding: '0.6rem 1.5rem', fontFamily: 'DM Mono, monospace', fontSize: '0.7rem', letterSpacing: '0.12em', cursor: 'pointer' }}>
            {loading ? 'SEEDING...' : 'BEGIN SESSION'}
          </button>
        </div>
      </div>
    </main>
  )
}
