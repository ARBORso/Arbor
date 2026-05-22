'use client'
import React, { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { supabase, Move, MoveType, Session } from '@/lib/supabase'

const MOVE_CONFIG = {
  extend: { symbol: '→', label: 'Extend', color: 'var(--extend)' },
  challenge: { symbol: '↔', label: 'Challenge', color: 'var(--challenge)' },
  pivot: { symbol: '↑', label: 'Pivot', color: 'var(--pivot)' },
}

export default function SessionPage() {
  const { id } = useParams()
  const [session, setSession] = useState<Session | null>(null)
  const [moves, setMoves] = useState<Move[]>([])
  const [input, setInput] = useState('')
  const [selectedMove, setSelectedMove] = useState<MoveType | null>(null)
  const [loading, setLoading] = useState(false)
  const [crystallizing, setCrystallizing] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { fetchSession() }, [id])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [moves])

  const fetchSession = async () => {
    const { data: s } = await supabase.from('sessions').select('*').eq('id', id).single()
    const { data: m } = await supabase.from('moves').select('*').eq('session_id', id).order('turn', { ascending: true })
    setSession(s)
    setMoves(m || [])
  }

  const lastMoveType = moves.length > 0 ? moves[moves.length - 1].move_type : null

  const handleMove = async () => {
    if (!input.trim() || !selectedMove || loading || selectedMove === lastMoveType) return
    setLoading(true)
    try {
      await fetch('/api/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: id, content: input.trim(), move_type: selectedMove, turn: moves.length })
      })
      await fetchSession()
      setInput('')
      setSelectedMove(null)
    } finally {
      setLoading(false)
    }
  }

  const handleCrystallize = async () => {
    if (!moves.length) return
    setCrystallizing(true)
    try {
      await fetch('/api/crystallize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: id })
      })
      await fetchSession()
    } finally {
      setCrystallizing(false)
    }
  }

  if (!session) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', fontSize: '0.7rem', letterSpacing: '0.1em' }}>LOADING...</div>
    </div>
  )

  const lastAIMove = moves.length > 0 && moves[moves.length - 1].role === 'ai' ? moves[moves.length - 1] : null
  const lastHumanMove = moves.length > 0 && moves[moves.length - 1].role === 'human' ? moves[moves.length - 1] : null

  return (
    <main style={{ minHeight: '100vh', maxWidth: '720px', margin: '0 auto', padding: '2rem 1.5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '3rem' }}>
        <a href="/" style={{ color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', fontSize: '0.65rem', letterSpacing: '0.1em', textDecoration: 'none' }}>← ARBOR</a>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
          {moves.length} MOVES
        </div>
      </div>

      {/* Seed */}
      <div style={{ marginBottom: '2.5rem', padding: '1.5rem', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '4px' }}>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.12em', marginBottom: '1rem' }}>PHASE 1 — SEED</div>
        <div style={{ color: 'var(--text-primary)', fontSize: '1.05rem', marginBottom: '1rem' }}>{session.seed_problem}</div>
        {session.seed_reframing && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.62rem', color: 'var(--accent-dim)', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>ARBOR REFRAMES →</div>
            <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '1.05rem' }}>{session.seed_reframing}</div>
          </div>
        )}
      </div>

      {/* Exchange */}
      {moves.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.12em', marginBottom: '1.5rem' }}>EXCHANGE</div>

          {moves.map((move, index) => {
            const config = MOVE_CONFIG[move.move_type]
            const isHuman = move.role === 'human'
            const isLast = index === moves.length - 1
            const isLastAI = isLast && move.role === 'ai'
            const isLastHuman = isLast && move.role === 'human'

            return (
              <div key={move.id} style={{ marginBottom: '2rem', paddingLeft: isHuman ? '0' : '1.5rem' }}>

                {/* Move header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem' }}>
                  <span style={{ color: config.color, fontFamily: 'DM Mono, monospace', fontSize: '0.75rem' }}>{config.symbol}</span>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.62rem', color: config.color, letterSpacing: '0.08em' }}>{config.label.toUpperCase()}</span>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.62rem', color: 'var(--text-muted)' }}>{isHuman ? 'YOU' : 'ARBOR'}</span>
                </div>

                {/* Move content */}
                <div style={{ color: isHuman ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: '1.05rem', lineHeight: '1.6', fontStyle: isHuman ? 'normal' : 'italic' }}>
                  {move.content}
                </div>

                {/* Inline response after last AI move */}
                {isLastAI && session.status !== 'complete' && (
                  <div style={{ marginTop: '1.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      {(Object.keys(MOVE_CONFIG) as MoveType[]).map(type => {
                        const c = MOVE_CONFIG[type]
                        const isDisabled = type === move.move_type
                        const isSelected = selectedMove === type
                        return (
                          <button key={type} onClick={() => !isDisabled && setSelectedMove(type)} disabled={isDisabled}
                            style={{ flex: 1, padding: '0.5rem 0.4rem', background: isSelected ? c.color + '22' : 'var(--bg-card)', border: '1px solid ' + (isSelected ? c.color : 'var(--border)'), borderRadius: '3px', color: isDisabled ? 'var(--text-muted)' : isSelected ? c.color : 'var(--text-secondary)', cursor: isDisabled ? 'not-allowed' : 'pointer', fontFamily: 'DM Mono, monospace', fontSize: '0.6rem', letterSpacing: '0.06em', transition: 'all 0.15s' }}>
                            <div style={{ marginBottom: '0.15rem' }}>{c.symbol}</div>
                            <div>{c.label.toUpperCase()}</div>
                            {isDisabled && <div style={{ fontSize: '0.5rem', opacity: 0.5, marginTop: '0.1rem' }}>USED</div>}
                          </button>
                        )
                      })}
                    </div>

                    {selectedMove && (
                      <div>
                        <textarea value={input} onChange={e => setInput(e.target.value)}
                          placeholder={`Make your ${MOVE_CONFIG[selectedMove].label.toLowerCase()} move...`}
                          rows={3} disabled={loading} autoFocus
                          style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '4px', padding: '1rem 1.25rem', color: 'var(--text-primary)', fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '1.05rem', lineHeight: '1.6', resize: 'none', outline: 'none' }}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleMove() } }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                          <button onClick={handleCrystallize} disabled={crystallizing}
                            style={{ background: 'transparent', color: 'var(--accent-dim)', border: '1px solid var(--accent-dim)', borderRadius: '3px', padding: '0.4rem 1rem', fontFamily: 'DM Mono, monospace', fontSize: '0.6rem', letterSpacing: '0.08em', cursor: 'pointer' }}>
                            {crystallizing ? 'CRYSTALLIZING...' : 'CRYSTALLIZE ◆'}
                          </button>
                          <button onClick={handleMove} disabled={!input.trim() || loading}
                            style={{ background: input.trim() && !loading ? 'var(--accent)' : 'var(--bg-card)', color: input.trim() && !loading ? 'var(--bg)' : 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '3px', padding: '0.4rem 1rem', fontFamily: 'DM Mono, monospace', fontSize: '0.6rem', letterSpacing: '0.08em', cursor: 'pointer' }}>
                            {loading ? 'THINKING...' : 'MAKE MOVE →'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Waiting for AI after human move */}
                {isLastHuman && session.status !== 'complete' && (
                  <div style={{ marginTop: '1rem', paddingLeft: '1.5rem' }}>
                    <div style={{ color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', fontSize: '0.62rem', letterSpacing: '0.08em', fontStyle: 'italic' }}>
                      ARBOR IS THINKING...
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* First move — no AI move yet */}
          {moves.length === 0 && session.status === 'exchange' && (
            <div style={{ marginBottom: '2rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                {(Object.keys(MOVE_CONFIG) as MoveType[]).map(type => {
                  const c = MOVE_CONFIG[type]
                  const isSelected = selectedMove === type
                  return (
                    <button key={type} onClick={() => setSelectedMove(type)}
                      style={{ flex: 1, padding: '0.5rem 0.4rem', background: isSelected ? c.color + '22' : 'var(--bg-card)', border: '1px solid ' + (isSelected ? c.color : 'var(--border)'), borderRadius: '3px', color: isSelected ? c.color : 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'DM Mono, monospace', fontSize: '0.6rem', letterSpacing: '0.06em' }}>
                      <div style={{ marginBottom: '0.15rem' }}>{c.symbol}</div>
                      <div>{c.label.toUpperCase()}</div>
                    </button>
                  )
                })}
              </div>
              {selectedMove && (
                <div>
                  <textarea value={input} onChange={e => setInput(e.target.value)}
                    placeholder={`Make your ${MOVE_CONFIG[selectedMove].label.toLowerCase()} move...`}
                    rows={3} disabled={loading} autoFocus
                    style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '4px', padding: '1rem 1.25rem', color: 'var(--text-primary)', fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '1.05rem', lineHeight: '1.6', resize: 'none', outline: 'none' }}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleMove() } }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                    <button onClick={handleMove} disabled={!input.trim() || loading}
                      style={{ background: input.trim() && !loading ? 'var(--accent)' : 'var(--bg-card)', color: input.trim() && !loading ? 'var(--bg)' : 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '3px', padding: '0.4rem 1rem', fontFamily: 'DM Mono, monospace', fontSize: '0.6rem', letterSpacing: '0.08em', cursor: 'pointer' }}>
                      {loading ? 'THINKING...' : 'MAKE MOVE →'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      )}

      {/* If no moves yet and exchange just started */}
      {moves.length === 0 && session.status === 'exchange' && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.12em', marginBottom: '1.5rem' }}>EXCHANGE — YOUR FIRST MOVE</div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {(Object.keys(MOVE_CONFIG) as MoveType[]).map(type => {
              const c = MOVE_CONFIG[type]
              const isSelected = selectedMove === type
              return (
                <button key={type} onClick={() => setSelectedMove(type)}
                  style={{ flex: 1, padding: '0.5rem 0.4rem', background: isSelected ? c.color + '22' : 'var(--bg-card)', border: '1px solid ' + (isSelected ? c.color : 'var(--border)'), borderRadius: '3px', color: isSelected ? c.color : 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'DM Mono, monospace', fontSize: '0.6rem', letterSpacing: '0.06em' }}>
                  <div style={{ marginBottom: '0.15rem' }}>{c.symbol}</div>
                  <div>{c.label.toUpperCase()}</div>
                </button>
              )
            })}
          </div>
          {selectedMove && (
            <div>
              <textarea value={input} onChange={e => setInput(e.target.value)}
                placeholder={`Make your ${MOVE_CONFIG[selectedMove].label.toLowerCase()} move...`}
                rows={3} disabled={loading} autoFocus
                style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '4px', padding: '1rem 1.25rem', color: 'var(--text-primary)', fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '1.05rem', lineHeight: '1.6', resize: 'none', outline: 'none' }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleMove() } }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button onClick={handleMove} disabled={!input.trim() || loading}
                  style={{ background: input.trim() && !loading ? 'var(--accent)' : 'var(--bg-card)', color: input.trim() && !loading ? 'var(--bg)' : 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '3px', padding: '0.4rem 1rem', fontFamily: 'DM Mono, monospace', fontSize: '0.6rem', letterSpacing: '0.08em', cursor: 'pointer' }}>
                  {loading ? 'THINKING...' : 'MAKE MOVE →'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Complete */}
      {session.status === 'complete' && (
        <div style={{ marginTop: '2rem' }}>
          <div style={{ padding: '2rem', background: 'var(--bg-card)', border: '1px solid var(--accent)', borderRadius: '4px', marginBottom: '1.5rem', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '-1px', left: '2rem', background: 'var(--accent)', padding: '0.2rem 0.75rem', fontFamily: 'DM Mono, monospace', fontSize: '0.6rem', color: 'var(--bg)', letterSpacing: '0.1em' }}>NODE ◆</div>
            <div style={{ color: 'var(--text-primary)', fontSize: '1.1rem', marginBottom: '1.5rem', marginTop: '0.5rem' }}>{session.node_statement}</div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.62rem', color: 'var(--accent-dim)', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>OPEN QUESTION →</div>
              <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '1.05rem' }}>{session.open_question}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <a href={`/seed?parent=${id}`}
              style={{ flex: 1, display: 'block', textAlign: 'center', padding: '0.75rem', background: 'var(--accent)', color: 'var(--bg)', borderRadius: '3px', fontFamily: 'DM Mono, monospace', fontSize: '0.65rem', letterSpacing: '0.1em', textDecoration: 'none' }}>
              BRANCH FROM THIS NODE →
            </a>
            <a href="/"
              style={{ flex: 1, display: 'block', textAlign: 'center', padding: '0.75rem', background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: '3px', fontFamily: 'DM Mono, monospace', fontSize: '0.65rem', letterSpacing: '0.1em', textDecoration: 'none' }}>
              VIEW THE TREE
            </a>
          </div>
        </div>
      )}
    </main>
  )
}
