'use client'
import React, { useEffect, useState } from 'react'
import { supabase, Session } from '@/lib/supabase'

export default function TreePage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('sessions')
        .select('*')
        .order('created_at', { ascending: true })
      setSessions(data || [])
      setLoading(false)
    }
    fetch()
  }, [])

  const roots = sessions.filter(s => !s.parent_node_id)
  const getChildren = (id: string) => sessions.filter(s => s.parent_node_id === id)

  const NodeCard = ({ session, depth = 0 }: { session: Session; depth?: number }) => {
    const children = getChildren(session.id)
    const isComplete = session.status === 'complete'

    return (
      <div style={{ marginLeft: depth > 0 ? '2rem' : '0', position: 'relative' }}>
        {depth > 0 && (
          <div style={{ position: 'absolute', left: '-1.25rem', top: '1.5rem', width: '1rem', height: '1px', background: 'var(--border)' }} />
        )}
        {depth > 0 && (
          <div style={{ position: 'absolute', left: '-1.25rem', top: '0', width: '1px', height: '1.5rem', background: 'var(--border)' }} />
        )}

        <a href={`/session/${session.id}`} style={{ textDecoration: 'none', display: 'block' }}>
          <div
            style={{
              padding: '1rem 1.25rem',
              marginBottom: '0.75rem',
              background: 'var(--bg-card)',
              border: '1px solid ' + (isComplete ? 'var(--accent-dim)' : 'var(--border)'),
              borderRadius: '4px',
              transition: 'border-color 0.2s',
              cursor: 'pointer',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = isComplete ? 'var(--accent-dim)' : 'var(--border)')}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.62rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
                {new Date(session.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
              <div style={{
                fontFamily: 'DM Mono, monospace',
                fontSize: '0.58rem',
                letterSpacing: '0.08em',
                color: isComplete ? 'var(--accent)' : 'var(--text-muted)',
                background: isComplete ? 'rgba(200,169,110,0.1)' : 'transparent',
                padding: '0.1rem 0.4rem',
                borderRadius: '2px',
              }}>
                {isComplete ? '◆ NODE' : session.status.toUpperCase()}
              </div>
            </div>

            <div style={{ color: 'var(--text-primary)', fontSize: '0.95rem', marginBottom: isComplete ? '0.75rem' : '0' }}>
              {session.seed_problem}
            </div>

            {isComplete && session.node_statement && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.9rem' }}>
                {session.node_statement}
              </div>
            )}

            {isComplete && session.open_question && (
              <div style={{ marginTop: '0.5rem', color: 'var(--accent-dim)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                ↳ {session.open_question}
              </div>
            )}
          </div>
        </a>

        {children.length > 0 && (
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: '0.75rem', top: '0', bottom: '0', width: '1px', background: 'var(--border)' }} />
            {children.map(child => (
              <NodeCard key={child.id} session={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <main style={{ minHeight: '100vh', maxWidth: '720px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
        <div>
          <a href="/" style={{ color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', fontSize: '0.65rem', letterSpacing: '0.1em', textDecoration: 'none' }}>
            ← ARBOR
          </a>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 300, letterSpacing: '0.1em', color: 'var(--text-primary)', marginTop: '0.5rem' }}>
            The Tree
          </h2>
        </div>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.62rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
          {sessions.length} SESSION{sessions.length !== 1 ? 'S' : ''}
        </div>
      </div>

      {loading && (
        <div style={{ color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', fontSize: '0.7rem', letterSpacing: '0.1em' }}>
          LOADING...
        </div>
      )}

      {!loading && sessions.length === 0 && (
        <div style={{ textAlign: 'center', padding: '4rem 0' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '1rem', marginBottom: '1rem' }}>
            The tree is empty.
          </div>
          <a href="/" style={{ color: 'var(--accent)', fontFamily: 'DM Mono, monospace', fontSize: '0.7rem', letterSpacing: '0.1em', textDecoration: 'none' }}>
            PLANT THE FIRST SEED →
          </a>
        </div>
      )}

      {roots.map(root => (
        <NodeCard key={root.id} session={root} depth={0} />
      ))}
    </main>
  )
}
