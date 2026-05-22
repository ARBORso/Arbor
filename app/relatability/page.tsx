'use client'
import React, { useEffect, useState, useRef, useCallback } from 'react'
import { supabase, Session, Move } from '@/lib/supabase'

type SessionScore = { id: string; session_a: string; session_b: string; score: number; reasoning: string }
type MoveScore = { id: string; move_a: string; move_b: string; score: number; reasoning: string }

type SeedNode = { kind: 'seed'; id: string; x: number; y: number; session: Session; radius: number }
type MoveNode = { kind: 'move'; id: string; x: number; y: number; move: Move; sessionId: string; radius: number }
type AnyNode = SeedNode | MoveNode

export default function RelatabilityPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [moves, setMoves] = useState<Move[]>([])
  const [sessionScores, setSessionScores] = useState<SessionScore[]>([])
  const [moveScores, setMoveScores] = useState<MoveScore[]>([])
  const [nodes, setNodes] = useState<AnyNode[]>([])
  const [selected, setSelected] = useState<AnyNode | null>(null)
  const [revealedSessionConns, setRevealedSessionConns] = useState<SessionScore[]>([])
  const [revealedMoveConns, setRevealedMoveConns] = useState<MoveScore[]>([])
  const [computing, setComputing] = useState(false)
  const [computingMoves, setComputingMoves] = useState(false)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const nodesRef = useRef<AnyNode[]>([])
  const isPanning = useRef(false)
  const lastPan = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const update = () => setDimensions({ width: window.innerWidth, height: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const { data: s } = await supabase.from('sessions').select('*').order('created_at', { ascending: true })
    const { data: m } = await supabase.from('moves').select('*').order('turn', { ascending: true })
    const { data: sr } = await supabase.from('relatability').select('*')
    const { data: mr } = await supabase.from('move_relatability').select('*')
    setSessions(s || [])
    setMoves(m || [])
    setSessionScores(sr || [])
    setMoveScores(mr || [])
  }

  const computeSessionScores = async () => {
    setComputing(true)
    try { await fetch('/api/relatability', { method: 'POST' }); await fetchData() }
    finally { setComputing(false) }
  }

  const computeMoveScores = async () => {
    setComputingMoves(true)
    try { await fetch('/api/move-relatability', { method: 'POST' }); await fetchData() }
    finally { setComputingMoves(false) }
  }

  // Layout: circle for root sessions, move-branched sessions orbit their parent move
  const computeLayout = useCallback((sessions: Session[], moves: Move[], width: number, height: number) => {
    const cx = width / 2
    const cy = height / 2
    const orbitRadius = Math.min(width, height) * 0.3
    const newNodes: AnyNode[] = []
    const movePositionMap = new Map<string, { x: number; y: number }>()

    const rootSessions = sessions.filter(s => !s.parent_move_id)

    // Place root sessions in a circle
    rootSessions.forEach((s, i) => {
      const angle = (i / Math.max(rootSessions.length, 1)) * Math.PI * 2 - Math.PI / 2
      const sx = cx + orbitRadius * Math.cos(angle)
      const sy = cy + orbitRadius * Math.sin(angle)

      newNodes.push({ kind: 'seed', id: s.id, x: sx, y: sy, session: s, radius: 24 })

      const sessionMoves = moves.filter(m => m.session_id === s.id)
      const moveOrbit = 70
      sessionMoves.forEach((mv, j) => {
        const mAngle = angle + ((j - (sessionMoves.length - 1) / 2) * 0.35)
        const mx = sx + moveOrbit * Math.cos(mAngle)
        const my = sy + moveOrbit * Math.sin(mAngle)
        newNodes.push({ kind: 'move', id: mv.id, x: mx, y: my, move: mv, sessionId: s.id, radius: 10 })
        movePositionMap.set(mv.id, { x: mx, y: my })
      })
    })

    // Place move-branched sessions near their parent move
    const branchedSessions = sessions.filter(s => s.parent_move_id)
    let remaining = [...branchedSessions]
    let maxIter = 5

    while (remaining.length > 0 && maxIter > 0) {
      maxIter--
      const next: Session[] = []
      remaining.forEach((s, i) => {
        const parentPos = s.parent_move_id
          ? Array.from(movePositionMap.entries()).find(([k]) => k.trim() === s.parent_move_id!.trim())?.[1]
          : null

        if (!parentPos) { next.push(s); return }

        // Place branched session near its parent move
        const offsetAngle = (Math.PI / 3) * (i % 2 === 0 ? 1 : -1)
        const sx = parentPos.x + 80 * Math.cos(offsetAngle)
        const sy = parentPos.y + 80 * Math.sin(offsetAngle)

        newNodes.push({ kind: 'seed', id: s.id, x: sx, y: sy, session: s, radius: 18 })

        const sessionMoves = moves.filter(m => m.session_id === s.id)
        sessionMoves.forEach((mv, j) => {
          const mAngle = offsetAngle + ((j - (sessionMoves.length - 1) / 2) * 0.35)
          const mx = sx + 50 * Math.cos(mAngle)
          const my = sy + 50 * Math.sin(mAngle)
          newNodes.push({ kind: 'move', id: mv.id, x: mx, y: my, move: mv, sessionId: s.id, radius: 8 })
          movePositionMap.set(mv.id, { x: mx, y: my })
        })
      })
      remaining = next
    }

    return newNodes
  }, [])

  useEffect(() => {
    const n = computeLayout(sessions, moves, dimensions.width, dimensions.height)
    setNodes(n)
    nodesRef.current = n
  }, [sessions, moves, dimensions, computeLayout])

  useEffect(() => { nodesRef.current = nodes }, [nodes])

  useEffect(() => {
    setRevealedSessionConns([])
    setRevealedMoveConns([])
    if (!selected) return

    if (selected.kind === 'seed') {
      const relevant = sessionScores
        .filter(s => s.session_a === selected.id || s.session_b === selected.id)
        .sort((a, b) => b.score - a.score)
      relevant.forEach((conn, i) => setTimeout(() => setRevealedSessionConns(prev => [...prev, conn]), i * 600))

      const sessionMoveIds = moves.filter(m => m.session_id === selected.id).map(m => m.id)
      const relevantMoveConns = moveScores
        .filter(s => sessionMoveIds.includes(s.move_a) || sessionMoveIds.includes(s.move_b))
        .sort((a, b) => b.score - a.score).slice(0, 10)
      relevantMoveConns.forEach((conn, i) => setTimeout(() => setRevealedMoveConns(prev => [...prev, conn]), i * 400 + 300))
    }

    if (selected.kind === 'move') {
      const relevant = moveScores
        .filter(s => s.move_a === selected.id || s.move_b === selected.id)
        .sort((a, b) => b.score - a.score)
      relevant.forEach((conn, i) => setTimeout(() => setRevealedMoveConns(prev => [...prev, conn]), i * 600))
    }
  }, [selected, sessionScores, moveScores, moves])

  const MOVE_COLORS: Record<string, string> = { extend: '#6e9e8a', challenge: '#9e6e6e', pivot: '#7a6e9e' }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const seedNodes = nodes.filter((n): n is SeedNode => n.kind === 'seed')
    const moveNodes = nodes.filter((n): n is MoveNode => n.kind === 'move')

    const draw = () => {
      ctx.clearRect(0, 0, dimensions.width, dimensions.height)
      ctx.save()
      ctx.translate(pan.x, pan.y)
      ctx.scale(zoom, zoom)

      // Dim connections when nothing selected
      if (!selected) {
        sessionScores.forEach(conn => {
          const sn = seedNodes.find(n => n.id === conn.session_a)
          const tn = seedNodes.find(n => n.id === conn.session_b)
          if (!sn || !tn) return
          const alpha = (conn.score / 10) * 0.12
          ctx.beginPath()
          ctx.moveTo(sn.x, sn.y)
          ctx.lineTo(tn.x, tn.y)
          ctx.strokeStyle = `rgba(200, 169, 110, ${alpha})`
          ctx.lineWidth = (conn.score / 10) * 2
          ctx.stroke()
        })
      }

      // Revealed session connections — thick bright
      revealedSessionConns.forEach(conn => {
        const sn = seedNodes.find(n => n.id === conn.session_a)
        const tn = seedNodes.find(n => n.id === conn.session_b)
        if (!sn || !tn) return
        const alpha = 0.3 + (conn.score / 10) * 0.7
        const width = 2 + (conn.score / 10) * 6

        ctx.beginPath()
        ctx.moveTo(sn.x, sn.y)
        ctx.lineTo(tn.x, tn.y)
        ctx.strokeStyle = `rgba(200, 169, 110, ${alpha * 0.3})`
        ctx.lineWidth = width + 8
        ctx.stroke()

        ctx.beginPath()
        ctx.moveTo(sn.x, sn.y)
        ctx.lineTo(tn.x, tn.y)
        ctx.strokeStyle = `rgba(200, 169, 110, ${alpha})`
        ctx.lineWidth = width
        ctx.stroke()

        const mx = (sn.x + tn.x) / 2, my = (sn.y + tn.y) / 2
        ctx.beginPath()
        ctx.arc(mx, my, 12, 0, Math.PI * 2)
        ctx.fillStyle = '#0a0a08'
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

      // Revealed move connections — thin dashed
      revealedMoveConns.forEach(conn => {
        const sn = moveNodes.find(n => n.id === conn.move_a)
        const tn = moveNodes.find(n => n.id === conn.move_b)
        if (!sn || !tn) return
        const alpha = 0.1 + (conn.score / 10) * 0.4
        ctx.beginPath()
        ctx.moveTo(sn.x, sn.y)
        ctx.lineTo(tn.x, tn.y)
        ctx.strokeStyle = `rgba(200, 169, 110, ${alpha})`
        ctx.lineWidth = 0.5 + (conn.score / 10) * 1.5
        ctx.setLineDash([3, 4])
        ctx.stroke()
        ctx.setLineDash([])
      })

      // Seed-to-move orbit lines
      seedNodes.forEach(seed => {
        moveNodes.filter(m => m.sessionId === seed.id).forEach(mv => {
          ctx.beginPath()
          ctx.moveTo(seed.x, seed.y)
          ctx.lineTo(mv.x, mv.y)
          ctx.strokeStyle = 'rgba(42, 42, 38, 0.5)'
          ctx.lineWidth = 0.5
          ctx.stroke()
        })
      })

      // Draw seed nodes
      seedNodes.forEach(node => {
        const isSelected = selected?.id === node.id
        const isConnected = revealedSessionConns.some(c => c.session_a === node.id || c.session_b === node.id)
        const isDimmed = selected && !isSelected && !isConnected

        ctx.globalAlpha = isDimmed ? 0.25 : 1

        if (isSelected || isConnected || node.session.status === 'complete') {
          const glow = ctx.createRadialGradient(node.x, node.y, node.radius, node.x, node.y, node.radius + 20)
          glow.addColorStop(0, 'rgba(200, 169, 110, 0.2)')
          glow.addColorStop(1, 'rgba(200, 169, 110, 0)')
          ctx.beginPath()
          ctx.arc(node.x, node.y, node.radius + 20, 0, Math.PI * 2)
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

      // Draw move nodes
      moveNodes.forEach(node => {
        const isSelected = selected?.id === node.id
        const isConnected = revealedMoveConns.some(c => c.move_a === node.id || c.move_b === node.id)
        const parentSelected = selected?.kind === 'seed' && selected.id === node.sessionId
        const isDimmed = selected && !isSelected && !isConnected && !parentSelected

        ctx.globalAlpha = isDimmed ? 0.15 : isConnected ? 1 : 0.7

        const color = MOVE_COLORS[node.move.move_type] || '#4a4a44'
        const symbols: Record<string, string> = { extend: '→', challenge: '↔', pivot: '↑' }

        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
        ctx.fillStyle = isSelected ? color + '44' : '#111110'
        ctx.fill()
        ctx.strokeStyle = isSelected || isConnected ? color : '#2a2a26'
        ctx.lineWidth = isSelected ? 2 : 1
        ctx.stroke()

        ctx.fillStyle = isConnected || isSelected ? color : '#3a3a36'
        ctx.font = '400 8px DM Mono, monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(symbols[node.move.move_type] || '·', node.x, node.y)

        ctx.globalAlpha = 1
      })

      ctx.restore()
      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animRef.current)
  }, [nodes, revealedSessionConns, revealedMoveConns, selected, dimensions, zoom, pan, sessionScores, moveScores])

  const toWorld = (x: number, y: number) => ({ x: (x - pan.x) / zoom, y: (y - pan.y) / zoom })

  const getNodeAt = (x: number, y: number) => {
    const w = toWorld(x, y)
    return nodesRef.current.find(n => Math.sqrt((n.x - w.x) ** 2 + (n.y - w.y) ** 2) < (n.kind === 'seed' ? 28 : 14))
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const rect = canvasRef.current!.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom(z => {
      const newZoom = Math.max(0.2, Math.min(5, z * delta))
      setPan(p => ({ x: mouseX - (mouseX - p.x) * (newZoom / z), y: mouseY - (mouseY - p.y) * (newZoom / z) }))
      return newZoom
    })
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const node = getNodeAt(e.clientX - rect.left, e.clientY - rect.top)
    if (!node) { isPanning.current = true; lastPan.current = { x: e.clientX - pan.x, y: e.clientY - pan.y } }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning.current) setPan({ x: e.clientX - lastPan.current.x, y: e.clientY - lastPan.current.y })
  }

  const handleMouseUp = () => { isPanning.current = false }

  const handleClick = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const node = getNodeAt(e.clientX - rect.left, e.clientY - rect.top)
    setSelected(node || null)
  }

  const details = (() => {
    if (!selected) return null
    if (selected.kind === 'seed') {
      const sessionConns = revealedSessionConns.map(conn => {
        const otherId = conn.session_a === selected.id ? conn.session_b : conn.session_a
        const other = sessions.find(s => s.id === otherId)
        return { other, score: conn.score, reasoning: conn.reasoning }
      })
      const moveConns = revealedMoveConns.map(conn => {
        const otherId = moves.find(m => m.id === conn.move_a)?.session_id === selected.id ? conn.move_b : conn.move_a
        const otherMove = moves.find(m => m.id === otherId)
        const otherSession = sessions.find(s => s.id === otherMove?.session_id)
        return { otherMove, otherSession, score: conn.score, reasoning: conn.reasoning }
      })
      return { sessionConns, moveConns }
    }
    if (selected.kind === 'move') {
      const moveConns = revealedMoveConns.map(conn => {
        const otherId = conn.move_a === selected.id ? conn.move_b : conn.move_a
        const otherMove = moves.find(m => m.id === otherId)
        const otherSession = sessions.find(s => s.id === otherMove?.session_id)
        return { otherMove, otherSession, score: conn.score, reasoning: conn.reasoning }
      })
      return { sessionConns: [], moveConns }
    }
    return null
  })()

  return (
    <div style={{ width: '100vw', height: '100vh', background: 'var(--bg)', overflow: 'hidden', position: 'relative' }}>

      <div style={{ position: 'absolute', top: '1.5rem', left: '50%', transform: 'translateX(-50%)', zIndex: 10, textAlign: 'center', pointerEvents: 'none' }}>
        <div style={{ fontSize: '1.4rem', fontWeight: 300, letterSpacing: '0.3em', color: 'var(--text-primary)' }}>ARBOR</div>
        <div style={{ color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', fontSize: '0.62rem', letterSpacing: '0.1em', marginTop: '0.3rem' }}>RELATABILITY MAP</div>
      </div>

      <div style={{ position: 'absolute', top: '1.5rem', left: '1.5rem', zIndex: 10 }}>
        <a href="/" style={{ color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', fontSize: '0.65rem', letterSpacing: '0.1em', textDecoration: 'none' }}>← ARBOR</a>
      </div>

      <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', zIndex: 10, display: 'flex', gap: '0.5rem' }}>
        <button onClick={computeSessionScores} disabled={computing}
          style={{ background: 'transparent', color: computing ? 'var(--text-muted)' : 'var(--accent)', border: '1px solid ' + (computing ? 'var(--border)' : 'var(--accent-dim)'), borderRadius: '3px', padding: '0.4rem 0.75rem', fontFamily: 'DM Mono, monospace', fontSize: '0.58rem', letterSpacing: '0.06em', cursor: computing ? 'default' : 'pointer' }}>
          {computing ? 'COMPUTING...' : 'COMPUTE SEEDS'}
        </button>
        <button onClick={computeMoveScores} disabled={computingMoves}
          style={{ background: 'transparent', color: computingMoves ? 'var(--text-muted)' : 'var(--accent)', border: '1px solid ' + (computingMoves ? 'var(--border)' : 'var(--accent-dim)'), borderRadius: '3px', padding: '0.4rem 0.75rem', fontFamily: 'DM Mono, monospace', fontSize: '0.58rem', letterSpacing: '0.06em', cursor: computingMoves ? 'default' : 'pointer' }}>
          {computingMoves ? 'COMPUTING...' : 'COMPUTE MOVES'}
        </button>
      </div>

      <div style={{ position: 'absolute', bottom: '4rem', left: '1.5rem', zIndex: 10, fontFamily: 'DM Mono, monospace', fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '0.08em', lineHeight: '2' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><span style={{ color: 'var(--accent)' }}>◆</span> SEED</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><span style={{ color: '#6e9e8a' }}>→</span> EXTEND</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><span style={{ color: '#9e6e6e' }}>↔</span> CHALLENGE</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><span style={{ color: '#7a6e9e' }}>↑</span> PIVOT</div>
      </div>

      <div style={{ position: 'absolute', bottom: '1.5rem', left: '1.5rem', zIndex: 10, fontFamily: 'DM Mono, monospace', fontSize: '0.58rem', color: 'var(--text-muted)', letterSpacing: '0.06em', lineHeight: '1.8' }}>
        <div>CLICK SEED — reveal connections</div>
        <div>SCROLL — zoom · DRAG — pan</div>
      </div>

      <div style={{ position: 'absolute', bottom: '4rem', right: selected ? '22rem' : '1.5rem', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '0.5rem', transition: 'right 0.3s' }}>
        <button onClick={() => setZoom(z => Math.min(5, z * 1.2))} style={{ width: '32px', height: '32px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1rem' }}>+</button>
        <button onClick={() => setZoom(z => Math.max(0.2, z * 0.8))} style={{ width: '32px', height: '32px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1rem' }}>−</button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} style={{ width: '32px', height: '32px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'DM Mono, monospace', fontSize: '0.55rem' }}>FIT</button>
      </div>

      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        style={{ cursor: 'pointer', display: 'block' }}
      />

      {sessions.length > 0 && sessionScores.length === 0 && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '0.5rem' }}>No scores computed yet.</div>
          <div style={{ color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', fontSize: '0.65rem' }}>Click COMPUTE SEEDS to begin.</div>
        </div>
      )}

      {selected && details && (
        <div style={{ position: 'absolute', top: '5rem', right: '1.5rem', width: '300px', maxHeight: 'calc(100vh - 7rem)', overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--accent-dim)', borderRadius: '4px', padding: '1.25rem', zIndex: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.6rem', color: 'var(--accent)', letterSpacing: '0.1em' }}>
              {selected.kind === 'seed' ? '◆ SELECTED NODE' : `${selected.move.move_type.toUpperCase()} MOVE`}
            </div>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'DM Mono, monospace', fontSize: '0.6rem' }}>✕</button>
          </div>

          <div style={{ color: 'var(--text-primary)', fontSize: '0.9rem', marginBottom: '0.75rem', lineHeight: '1.5' }}>
            {selected.kind === 'seed' ? selected.session.seed_problem : selected.move.content}
          </div>

          {details.sessionConns.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.58rem', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                SEED CONNECTIONS — {details.sessionConns.length}
              </div>
              {details.sessionConns.map((conn, i) => conn.other && (
                <div key={i} style={{ marginBottom: '0.5rem', padding: '0.5rem', background: 'var(--bg)', borderRadius: '3px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', flex: 1, marginRight: '0.5rem' }}>
                      {conn.other.seed_problem.length > 28 ? conn.other.seed_problem.slice(0, 28) + '...' : conn.other.seed_problem}
                    </div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.65rem', color: 'var(--accent)', flexShrink: 0 }}>{conn.score.toFixed(1)}</div>
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.75rem', lineHeight: '1.4' }}>{conn.reasoning}</div>
                </div>
              ))}
            </div>
          )}

          {details.moveConns.length > 0 && (
            <div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.58rem', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                MOVE RESONANCES — {details.moveConns.length}
              </div>
              {details.moveConns.map((conn, i) => conn.otherMove && (
                <div key={i} style={{ marginBottom: '0.5rem', padding: '0.5rem', background: 'var(--bg)', borderRadius: '3px', border: '1px solid rgba(58,58,54,0.5)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontFamily: 'DM Mono, monospace' }}>
                      {conn.otherMove.move_type.toUpperCase()} · {conn.otherSession?.seed_problem.slice(0, 20)}...
                    </div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.62rem', color: 'var(--accent-dim)', flexShrink: 0 }}>{conn.score.toFixed(1)}</div>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', lineHeight: '1.4', marginBottom: '0.25rem' }}>
                    {conn.otherMove.content.length > 80 ? conn.otherMove.content.slice(0, 80) + '...' : conn.otherMove.content}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.72rem', lineHeight: '1.4' }}>{conn.reasoning}</div>
                </div>
              ))}
            </div>
          )}

          {details.sessionConns.length === 0 && details.moveConns.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', fontSize: '0.65rem', fontStyle: 'italic' }}>
              No connections found yet. Compute scores first.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
