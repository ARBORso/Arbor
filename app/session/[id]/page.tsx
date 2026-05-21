'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase, Move, MoveType, Session } from '@/lib/supabase'

const MOVE_CONFIG = {
  extend: { symbol: '→', label: 'Extend', desc: 'Build forward', color: 'var(--extend)' },
  challenge: { symbol: '↔', label: 'Challenge', desc: 'Find the tension', color: 'var(--challenge)' },
  pivot: { symbol: '↑', label: 'Pivot', desc: 'Unexpected leap', color: 'var(--pivot)' },
}

export default function SessionPage() {
  const { id } = useParams()
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [moves, setMoves] = useState<Move[]>([])
  const [input, setInput] = useState('')
  const [selectedMove, setSelectedMove] = useState<MoveType | null>(null)
  const [loading, setLoading] = useState(false)
  const [nodeStatement, setNodeStatement] = useState('')
  const [crystallizing, setCrystallizing] = useState(false)
  const [timeLeft, setTimeLeft] = useState(90)
  const [timerActive, setTimerActive] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    fetchSession()
  }, [id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [moves])

  useEffect(() => {
    if (timerActive && timeLeft > 0) {
      timerRef.current = setTimeout(() => setTimeLeft(t => t - 1), 1000)
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [timerActive, timeLeft])

  const fetchSession = async () => {
    const { data: s } = await supabase.from('sessions').select('*').eq('id', id).single()
    const { data: m } = await supabase.from('moves').select('*').eq('session_id', id).order('turn', { ascending: true })
    setSession(s)
    setMoves(m || [])
  }

  const lastMoveType = moves.length > 0 ? moves[moves.length - 1].move_type : null
  const isExchangeComplete = moves.length >= 10

  const handleMove = async () => {
    if (!input.trim() || !selectedMove || loading) return
    if (selectedMove === lastMoveType) return

    setLoading(true)
    setTimerActive(false)
    const currentTurn = moves.length

    try {
      const res = await fetch('/api/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: id,
          content: input.trim(),
          move_type: selectedMove,
          turn: currentTurn
        })
      })
      const { aiMove, isComplete } = await res.json()

      await fetchSession()
      setInput('')
      setSelectedMove(null)
      setTimeLeft(90)

      if (!isComplete) {
        setTimerActive(true)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleCrystallize = async () => {
    if (!nodeStatement.trim()) return
    setCrystallizing(true)
    try {
      await fetch('/api/crystallize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: id, node_statement: nodeStatement.trim() })
      })
      await fetchSession()
    } finally {
      setCrystallizing(false)
    }
  }

  if (!session) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', fontSize: '0.7rem', letterSpacing: '0.1em' }}>
        LOADING SESSION...
      </div>
    </div>
  )

  return (
    <main style={{ minHeight: '100vh', maxWidth: '720px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '3rem' }}>
        <div>
          <a href="/" style={{ color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', fontSize: '0.65rem', letterSpacing: '0.1em', textDecoration: 'none' }}>
            ← ARBOR
          </a>
        </div>
        <div style={{ textAlign: 'right', fontFamily: 'DM Mono, monospace', fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
          <div>TURN {Math.min(moves.length + 1, 10)} / 10</div>
          {timerActive && !isExchangeComplete && (
            <div style={{ color: timeLeft < 20 ? 'var(--challenge)' : 'var(--text-muted)', marginTop: '0.25rem' }}>
              {String(Math.floor(timeLeft / 60)).padStart(2, '0')}:{String(timeLeft % 60).padStart(2, '0')}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginBottom: '2.5rem', padding: '1.5rem', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '4px' }}>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.12em', marginBottom: '1rem' }}>
          PHASE 1 — SEED
        </div>
        <div style={{ color: 'var(--text-primary)', fontSize: '1.05rem', marginBottom: '1rem' }}>
          {session.seed_problem}
        </div>
        {session.seed_reframing && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.62rem', color: 'var(--accent-dim)', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
              ARBOR REFRAMES →
            </div>
            <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '1.05rem' }}>
              {session.seed_reframing}
            </div>
          </div>
        )}
      </div>

      {moves.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.12em', marginBottom: '1.5rem' }}>
            PHASE 2 — EXCHANGE
          </div>
          
          {moves.map((move, i) => {
            const config = MOVE_CONFIG[move.move_type]
            const isHuman = move.role === 'human'
            return (
              <div
                key={move.id}
                style={{
                  marginBottom: '1.5rem',
                  paddingLeft: isHuman ? '0' : '1.5rem',
                  animation: 'fadeUp 0.4s ease forwards',
                  opacity: 0,
                  animationDelay: `${i * 0.05}s`,
                  animationFillMode: 'forwards'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem' }}>
                  <span style={{ color: config.color, fontFamily: 'DM Mono, monospace', fontSize: '0.75rem' }}>
                    {config.symbol}
                  </span>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.62rem', color: config.color, letterSpacing: '0.08em' }}>
                    {config.label.toUpperCase()}
                  </span>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.62rem', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
                    {isHuman ? 'YOU' : 'ARBOR'}
                  </span>
                </div>
                <div style={{ color: isHuman ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: '1.05rem', lineHeight: '1.6', fontStyle: isHuman ? 'normal' : 'italic' }}>
                  {move.content}
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
      )}

      {!isExchangeComplete && session.status === 'exchange' && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
            {(Object.keys(MOVE_CONFIG) as MoveType[]).map(type => {
              const config = MOVE_CONFIG[type]
              const isDisabled = type === lastMoveType
              const isSelected = selectedMove === type
              return (
                <button
                  key={type}
                  onClick={() => !isDisabled && setSelectedMove(type)}
                  disabled={isDisabled}
                  style={{
                    flex: 1,
                    padding: '0.6rem',
                    background: isSelected ? config.color + '22' : 'var(--bg-card)',
                    border: '1px solid ' + (isSelected ? config.color : isDisabled ? 'var(--border)' : 'var(--border-light)'),
                    borderRadius: '3px',
                    color: isDisabled ? 'var(--text-muted)' : isSelected ? config.color : 'var(--text-secondary)',
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    fontFamily: 'DM Mono, monospace',
                    fontSize: '0.65rem',
                    letterSpacing: '0.08em',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ marginBottom: '0.2rem', fontSize: '0.85rem' }}>{config.symbol}</div>
                  <div>{config.label.toUpperCase()}</div>
                  {isDisabled && <div style={{ fontSize: '0.55rem', marginTop: '0.2rem', opacity: 0.6 }}>USED</div>}
                </button>
              )
            })}
          </div>

          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={selectedMove ? `Make your ${MOVE_CONFIG[selectedMove].label.toLowerCase()} move...` : 'Select a move type first...'}
            rows={3}
            disabled={!selectedMove || loading}
            style={{
              width: '100%',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '1rem 1.25rem',
              color: 'var(--text-primary)',
              fontFamily: 'Cormorant Garamond, Georgia, serif',
              fontSize: '1.05rem',
              lineHeight: '1.6',
              resize: 'none',
              outline: 'none',
              transition: 'border-color 0.2s',
              opacity: !selectedMove ? 0.5 : 1,
            }}
            onFocus={e => e.target.style.borderColor = 'var(--accent-dim)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleMove() } }}
          />

          {lastMoveType && (
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '0.5rem', letterSpacing: '0.06em' }}>
              CANNOT REPEAT: {lastMoveType.toUpperCase()}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
            <button
              onClick={handleMove}
              disabled={!input.trim() || !selectedMove || loading || selectedMove === lastMoveType}
              style={{
                background: input.trim() && selectedMove && !loading && selectedMove !== lastMoveType ? 'var(--accent)' : 'var(--bg-card)',
                color: input.trim() && selectedMove && !loading ? 'var(--bg)' : 'var(--text-muted)',
                border: '1px solid ' + (input.trim() && selectedMove && selectedMove !== lastMoveType ? 'var(--accent)' : 'var(--border)'),
                borderRadius: '3px',
                padding: '0.5rem 1.25rem',
                fontFamily: 'DM Mono, monospace',
                fontSize: '0.65rem',
                letterSpacing: '0.1em',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {loading ? 'THINKING...' : 'MAKE MOVE →'}
            </button>
          </div>
        </div>
      )}

      {isExchangeComplete && session.status !== 'complete' && (
        <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'var(--bg-card)', border: '1px solid var(--accent-dim)', borderRadius: '4px' }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.65rem', color: 'var(--accent)', letterSpacing: '0.12em', marginBottom: '1rem' }}>
            PHASE 3 — CRYSTALLIZATION
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '1.25rem', fontStyle: 'italic' }}>
            The exchange is complete. Distil everything into one Node statement — where did the thinking arrive?
          </p>
          <textarea
            value={nodeStatement}
            onChange={e => setNodeStatement(e.target.value)}
            placeholder="The session arrived at..."
            rows={3}
            style={{
              width: '100%',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '1rem 1.25rem',
              color: 'var(--text-primary)',
              fontFamily: 'Cormorant Garamond, Georgia, serif',
              fontSize: '1.05rem',
              lineHeight: '1.6',
              resize: 'none',
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
            <button
              onClick={handleCrystallize}
              disabled={!nodeStatement.trim() || crystallizing}
              style={{
                background: nodeStatement.trim() ? 'var(--accent)' : 'var(--bg)',
                color: nodeStatement.trim() ? 'var(--bg)' : 'var(--text-muted)',
                border: '1px solid ' + (nodeStatement.trim() ? 'var(--accent)' : 'var(--border)'),
                borderRadius: '3px',
                padding: '0.5rem 1.25rem',
                fontFamily: 'DM Mono, monospace',
                fontSize: '0.65rem',
                letterSpacing: '0.1em',
                cursor: 'pointer',
              }}
            >
              {crystallizing ? 'CRYSTALLIZING...' : 'FORM NODE ◆'}
            </button>
          </div>
        </div>
      )}

      {session.status === 'complete' && (
        <div style={{ marginTop: '2rem' }}>
          <div style={{ padding: '2rem', background: 'var(--bg-card)', border: '1px solid var(--accent)', borderRadius: '4px', marginBottom: '1.5rem', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '-1px', left: '2rem', background: 'var(--accent)', padding: '0.2rem 0.75rem', fontFamily: 'DM Mono, monospace', fontSize: '0.6rem', color: 'var(--bg)', letterSpacing: '0.1em' }}>
              NODE ◆
            </div>
            <div style={{ color: 'var(--text-primary)', fontSize: '1.1rem', marginBottom: '1.5rem', marginTop: '0.5rem' }}>
              {session.node_statement}
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.62rem', color: 'var(--accent-dim)', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
                OPEN QUESTION →
              </div>
              <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '1.05rem' }}>
                {session.open_question}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            
              href={`/?parent=${id}`}
              style={{
                flex: 1,
                display: 'block',
                textAlign: 'center',
                padding: '0.75rem',
                background: 'var(--accent)',
                color: 'var(--bg)',
                borderRadius: '3px',
                fontFamily: 'DM Mono, monospace',
                fontSize: '0.65rem',
                letterSpacing: '0.1em',
                textDecoration: 'none',
              }}
            >
              BRANCH FROM THIS NODE →
            </a>
            
              href="/tree"
              style={{
                flex: 1,
                display: 'block',
                textAlign: 'center',
                padding: '0.75rem',
                background: 'var(--bg-card)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                fontFamily: 'DM Mono, monospace',
                fontSize: '0.65rem',
                letterSpacing: '0.1em',
                textDecoration: 'none',
              }}
            >
              VIEW THE TREE
            </a>
          </div>
        </div>
      )}
    </main>
  )
}
