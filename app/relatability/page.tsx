'use client'
import React, { useEffect, useState, useRef, useCallback } from 'react'
import { supabase, Session } from '@/lib/supabase'

type RelatabilityScore = {
  id: string
  session_a: string
  session_b: string
  score: number
  reasoning: string
}

type Node = {
  id: string
  x: number
  y: number
  session: Session
  radius: number
}

type Connection = {
  source: Node
  target: Node
  score: number
  reasoning: string
}

export default function RelatabilityPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [scores, setScores] = useState<RelatabilityScore[]>([])
  const [nodes, setNodes] = useState<Node[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [selected, setSelected] = useState<Node | null>(null)
  const [revealedConnections, setRevealedConnections] = useState<Connection[]>([])
  const [computing, setComputing] = useState(false)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const nodesRef = useRef<Node[]>([])
  const isPanning = useRef(false)
  const lastPan = useRef({ x: 0, y: 0 })
  const revealTimer = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const update = () => setDimensions({ width: window.innerWidth, height: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    const { data: s } = await supabase.from('sessions').select('*').eq('status', 'complete')
    const { data: r } = await supabase.from('relatability').select('*')
    setSessions(s || [])
    setScores(r || [])
  }

  const computeScores = async () => {
    setComputing(true)
    try {
      await fetch('/api/relatability', { method: 'POST' })
      await fetchData()
    } finally {
      setComputing(false)
    }
  }

  // Layout nodes in a circle
  const computeLayout = useCallback((sessions: Session[], width: number, height: number) => {
    const cx = width / 2
    const cy = height / 2
    const radius = Math.min(width, height) * 0.32

    return sessions.map((s, i) => {
      const angle = (i / sessions.length) * Math.PI * 2 - Math.PI / 2
      return {
        id: s.id,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
        session: s,
        radius: 24,
      }
    })
  }, [])

  useEffect(() => {
    const n = computeLayout(sessions, dimensions.width, dimensions.height)
    setNodes(n)
    nodesRef.current = n

    // Build connections from scores
    const c: Connection[] = scores
      .filter(s => s.score >= 3)
      .map(s => {
        const source = n.find(node => node.id === s.session_a)
        const target = n.find(node => node.id === s.session_b)
        if (!source || !target) return null
        return { source, target, score: s.score, reasoning: s.reasoning }
      })
      .filter(Boolean) as Connection[]

    setConnections(c)
  }, [sessions, scores, dimensions, computeLayout])

  useEffect(() => { nodesRef.current = nodes }, [nodes])

  // Progressive reveal when node selected
  useEffect(() => {
    if (!selected) {
      setRevealedConnections([])
      return
    }

    const relevant = connections
      .filter(c => c.source.id === selected.id || c.target.id === selected.id)
      .sort((a, b) => b.score - a.score)

    setRevealedConnections([])
    relevant.forEach((conn, i) => {
      const t = setTimeout(() => {
        setRevealedConnections(prev => [...prev, conn])
      }, i * 600)
      return () => clearTimeout(t)
    })
  }, [selected, connections])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      ctx.clearRect(0, 0, dimensions.width, dimensions.height)
      ctx.save()
      ctx.translate(pan.x, pan.y)
      ctx.scale(zoom, zoom)

      // Draw all connections (dim)
      if (!selected) {
        connections.forEach(conn => {
          const alpha = (conn.score / 10) * 0.15
          ctx.beginPath()
          ctx.moveTo(conn.source.x, conn.source.y)
          ctx.lineTo(conn.target.x, conn.target.y)
          ctx.strokeStyle = `rgba(138, 114, 72, ${alpha})`
          ctx.lineWidth = (conn.score / 10) * 2
          ctx.stroke()
        })
      }

      // Draw revealed connections progressively
      revealedConnections.forEach((conn, i) => {
        const alpha = 0.2 + (conn.score / 10) * 0.6
        const width = 1 + (conn.score / 10) * 3

        // Glowing line
        ctx.beginPath()
        ctx.moveTo(conn.source.x, conn.source.y)
        ctx.lineTo(conn.target.x, conn.target.y)
        ctx.strokeStyle = `rgba(200, 169, 110, ${alpha})`
        ctx.lineWidth = width + 4
        ctx.globalAlpha = 0.15
        ctx.stroke()
        ctx.globalAlpha = 1

        ctx.beginPath()
        ctx.moveTo(conn.source.x, conn.source.y)
        ctx.lineTo(conn.target.x, conn.target.y)
        ctx.strokeStyle = `rgba(200, 169, 110, ${alpha})`
        ctx.lineWidth = width
        ctx.stroke()

        // Score badge at midpoint
        const mx = (conn.source.x + conn.target.x) / 2
        const my = (conn.source.y + conn.target.y) / 2
        ctx.beginPath()
        ctx.arc(mx, my, 10, 0, Math.PI * 2)
        ctx.fillStyle = '#1a1a16'
        ctx.fill()
        ctx.strokeStyle = 'rgba(200, 169, 110, 0.5)'
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.fillStyle = '#c8a96e'
        ctx.font = '500 8px DM Mono, monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(conn.score.toFixed(1), mx, my)
      })

      // Draw nodes
      nodes.forEach(node => {
        const isSelected = selected?.id === node.id
        const isConnected = revealedConnections.some(
          c => c.source.id === node.id || c.target.id === node.id
        )
        const isDimmed = selected && !isSelected && !isConnected

        ctx.globalAlpha = isDimmed ? 0.3 : 1

        // Glow
        if (isSelected || isConnected) {
          const glow = ctx.createRadialGradient(node.x, node.y, node.radius, node.x, node.y, node.radius + 16)
          glow.addColorStop(0, 'rgba(200, 169, 110, 0.25)')
          glow.addColorStop(1, 'rgba(200, 169, 110, 0)')
          ctx.beginPath()
          ctx.arc(node.x, node.y, node.radius + 16, 0, Math.PI * 2)
          ctx.fillStyle = glow
          ctx.fill()
        }

        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
        ctx.fillStyle = '#1a1a16'
        ctx.fill()
        ctx.strokeStyle = isSelected ? '#c8a96e' : isConnected ? '#8a7248' : '#3a3a36'
        ctx.lineWidth = isSelected ? 2.5 : 1.5
        ctx.stroke()

        ctx.fillStyle = isSelected ? '#c8a96e' : '#8a7248'
        ctx.font = '500 11px DM Mono, monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('◆', node.x, node.y)

        const label = node.session.seed_problem.length > 20
          ? node.session.seed_problem.slice(0, 20) + '...'
          : node.session.seed_problem
        ctx.fillStyle = isSelected ? '#8a8578' : '#4a4a44'
        ctx.font = '400 9px DM Mono, monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(label, node.x, node.y + node.radius + 8)

        ctx.globalAlpha = 1
      })

      ctx.restore()
      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animRef.current)
  }, [nodes, connections, revealedConnections, selected, dimensions, zoom, pan])

  const toWorldCoords = (x: number, y: number) => ({
    x: (x - pan.x) / zoom,
    y: (y - pan.y) / zoom,
  })

  const getNodeAt = (x: number, y: number) => {
    const w = toWorldCoords(x, y)
    return nodesRef.current.find(n => Math.sqrt((n.x - w.x) ** 2 + (n.y - w.y) ** 2) < n.radius + 12)
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom(z => Math.max(0.2, Math.min(5, z * delta)))
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const node = getNodeAt(e.clientX - rect.left, e.clientY - rect.top)
    if (!node) {
      isPanning.current = true
      lastPan.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning.current) {
      setPan({ x: e.clientX - lastPan.current.x, y: e.clientY - lastPan.current.y })
    }
  }

  const handleMouseUp = () => { isPanning.current = false }

  const handleClick = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const node = getNodeAt(e.clientX - rect.left, e.clientY - rect.top)
    setSelected(node || null)
  }

  const topConnection = revealedConnections[0]

  return (
    <div style={{ width: '100vw', height: '100vh', background: 'var(--bg)', overflow: 'hidden', position: 'relative' }}>

      {/* Header */}
      <div style={{ position: 'absolute', top: '1.5rem', left: '50%', transform: 'translateX(-50%)', zIndex: 10, textAlign: 'center', pointerEvents: 'none' }}>
        <div style={{ fontSize: '1.4rem', fontWeight: 300, letterSpacing: '0.3em', color: 'var(--text-primary)' }}>ARBOR</div>
        <div style={{ color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', fontSize: '0.62rem', letterSpacing: '0.1em', marginTop: '0.3rem' }}>RELATABILITY MAP</div>
      </div>

      {/* Back */}
      <div style={{ position: 'absolute', top: '1.5rem', left: '1.5rem', zIndex: 10 }}>
        <a href="/" style={{ color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', fontSize: '0.65rem', letterSpacing: '0.1em', textDecoration: 'none' }}>← ARBOR</a>
      </div>

      {/* Compute button */}
      <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', zIndex: 10 }}>
        <button
          onClick={computeScores}
          disabled={computing}
          style={{ background: 'transparent', color: computing ? 'var(--text-muted)' : 'var(--accent)', border: '1px solid ' + (computing ? 'var(--border)' : 'var(--accent-dim)'), borderRadius: '3px', padding: '0.4rem 1rem', fontFamily: 'DM Mono, monospace', fontSize: '0.62rem', letterSpacing: '0.08em', cursor: computing ? 'default' : 'pointer' }}>
          {computing ? 'COMPUTING...' : 'COMPUTE SCORES'}
        </button>
      </div>

      {/* Zoom controls */}
      <div style={{ position: 'absolute', bottom: '4rem', left: '1.5rem', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <button onClick={() => setZoom(z => Math.min(5, z * 1.2))}
          style={{ width: '32px', height: '32px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'DM Mono, monospace', fontSize: '1rem' }}>+</button>
        <button onClick={() => setZoom(z => Math.max(0.2, z * 0.8))}
          style={{ width: '32px', height: '32px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'DM Mono, monospace', fontSize: '1rem' }}>−</button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}
          style={{ width: '32px', height: '32px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'DM Mono, monospace', fontSize: '0.55rem', letterSpacing: '0.05em' }}>FIT</button>
      </div>

      {/* Instructions */}
      <div style={{ position: 'absolute', bottom: '1.5rem', left: '1.5rem', zIndex: 10, fontFamily: 'DM Mono, monospace', fontSize: '0.58rem', color: 'var(--text-muted)', letterSpacing: '0.06em', lineHeight: '1.8' }}>
        <div>CLICK NODE — reveal connections</div>
        <div>SCROLL — zoom · DRAG — pan</div>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        style={{ cursor: isPanning.current ? 'grabbing' : 'pointer', display: 'block' }}
      />

      {/* No scores state */}
      {sessions.length > 0 && scores.length === 0 && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '0.5rem' }}>No scores computed yet.</div>
          <div style={{ color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', fontSize: '0.65rem' }}>Click COMPUTE SCORES to begin.</div>
        </div>
      )}

      {/* Selected panel */}
      {selected && (
        <div style={{ position: 'absolute', bottom: '1.5rem', right: '1.5rem', width: '300px', background: 'var(--bg-card)', border: '1px solid var(--accent-dim)', borderRadius: '4px', padding: '1.25rem', zIndex: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.6rem', color: 'var(--accent)', letterSpacing: '0.1em' }}>◆ SELECTED NODE</div>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'DM Mono, monospace', fontSize: '0.6rem' }}>✕</button>
          </div>
          <div style={{ color: 'var(--text-primary)', fontSize: '0.9rem', marginBottom: '0.75rem', lineHeight: '1.5' }}>
            {selected.session.seed_problem}
          </div>
          {selected.session.node_statement && (
            <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.82rem', marginBottom: '0.75rem', lineHeight: '1.5', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
              {selected.session.node_statement}
            </div>
          )}

          {revealedConnections.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.58rem', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                CONNECTIONS FOUND — {revealedConnections.length}
              </div>
              {revealedConnections.map((conn, i) => {
                const other = conn.source.id === selected.id ? conn.target : conn.source
                return (
                  <div key={i} style={{ marginBottom: '0.6rem', padding: '0.5rem', background: 'var(--bg)', borderRadius: '3px', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', flex: 1, marginRight: '0.5rem' }}>
                        {other.session.seed_problem.length > 30
                          ? other.session.seed_problem.slice(0, 30) + '...'
                          : other.session.seed_problem}
                      </div>
                      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.65rem', color: 'var(--accent)', flexShrink: 0 }}>
                        {conn.score.toFixed(1)}
                      </div>
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.75rem', lineHeight: '1.4' }}>
                      {conn.reasoning}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ marginTop: '0.75rem' }}>
            <a href={`/session/${selected.id}`}
              style={{ display: 'block', textAlign: 'center', padding: '0.5rem', background: 'var(--accent)', color: 'var(--bg)', borderRadius: '3px', fontFamily: 'DM Mono, monospace', fontSize: '0.6rem', letterSpacing: '0.08em', textDecoration: 'none' }}>
              OPEN SESSION
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
