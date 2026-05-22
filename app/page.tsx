'use client'
import React, { useEffect, useState, useRef, useCallback } from 'react'
import { supabase, Session, Move } from '@/lib/supabase'

type SeedNode = {
  kind: 'seed'
  id: string
  x: number
  y: number
  session: Session
  radius: number
}

type MoveNode = {
  kind: 'move'
  id: string
  x: number
  y: number
  move: Move
  sessionId: string
  radius: number
}

type AnyNode = SeedNode | MoveNode

type RootPath = {
  sessionId: string
  points: { x: number; y: number }[]
  moves: Move[]
}

export default function Home() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [allMoves, setAllMoves] = useState<Move[]>([])
  const [seedNodes, setSeedNodes] = useState<SeedNode[]>([])
  const [moveNodes, setMoveNodes] = useState<MoveNode[]>([])
  const [rootPaths, setRootPaths] = useState<RootPath[]>([])
  const [links, setLinks] = useState<{ source: SeedNode; target: SeedNode }[]>([])
  const [selected, setSelected] = useState<AnyNode | null>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const seedNodesRef = useRef<SeedNode[]>([])
  const moveNodesRef = useRef<MoveNode[]>([])
  const isPanning = useRef(false)
  const lastPan = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const update = () => setDimensions({ width: window.innerWidth, height: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [])

  const fetchData = async () => {
    const { data: s } = await supabase.from('sessions').select('*').order('created_at', { ascending: true })
    const { data: m } = await supabase.from('moves').select('*').order('turn', { ascending: true })
    setSessions(s || [])
    setAllMoves(m || [])
  }

  // Compute root path for a session's moves
  // Each move type bends the root differently
  const computeRootPath = (
    startX: number,
    startY: number,
    moves: Move[],
    sessionIndex: number,
    totalSessions: number
  ): { points: { x: number; y: number }[]; movePositions: { x: number; y: number }[] } => {
    const points: { x: number; y: number }[] = [{ x: startX, y: startY }]
    const movePositions: { x: number; y: number }[] = []

    // Base direction — roots grow downward, spread based on session position
    const baseAngle = Math.PI / 2 // straight down
    const spreadAngle = ((sessionIndex / Math.max(totalSessions - 1, 1)) - 0.5) * (Math.PI * 0.6)
    let currentAngle = baseAngle + spreadAngle
    let currentX = startX
    let currentY = startY
    const segmentLength = 45

    moves.forEach((mv, i) => {
      // Each move type bends the angle differently
      if (mv.move_type === 'extend') {
        // Extend: continues forward with slight drift toward center
        const drift = -spreadAngle * 0.15
        currentAngle += drift
      } else if (mv.move_type === 'challenge') {
        // Challenge: sharp bend, hits resistance
        const bendDir = (sessionIndex % 2 === 0 ? 1 : -1) * (i % 2 === 0 ? 1 : -1)
        currentAngle += bendDir * (Math.PI / 5)
      } else if (mv.move_type === 'pivot') {
        // Pivot: sudden direction change at golden angle
        const goldenAngle = 2.399
        currentAngle += (i % 2 === 0 ? 1 : -1) * goldenAngle * 0.4
      }

      // Add some organic wobble
      const wobble = Math.sin(i * 1.7 + sessionIndex) * 0.08
      currentAngle += wobble

      // Keep roots growing mostly downward
      const maxDeviation = Math.PI / 2.5
      const downAngle = Math.PI / 2
      if (Math.abs(currentAngle - downAngle) > maxDeviation) {
        currentAngle = downAngle + Math.sign(currentAngle - downAngle) * maxDeviation
      }

      currentX += segmentLength * Math.cos(currentAngle)
      currentY += segmentLength * Math.sin(currentAngle)

      points.push({ x: currentX, y: currentY })
      movePositions.push({ x: currentX, y: currentY })
    })

    return { points, movePositions }
  }

  const computeLayout = useCallback((sessions: Session[], moves: Move[], width: number, height: number) => {
    // Seeds sit at the top, spread horizontally
    const SEED_Y = 100
    const PADDING = 80
    const availableWidth = width - PADDING * 2

    const newSeedNodes: SeedNode[] = []
    const newMoveNodes: MoveNode[] = []
    const newRootPaths: RootPath[] = []
    const newLinks: { source: SeedNode; target: SeedNode }[] = []

    sessions.forEach((s, i) => {
      const sx = sessions.length === 1
        ? width / 2
        : PADDING + (i / (sessions.length - 1)) * availableWidth
      const sy = SEED_Y

      const seedNode: SeedNode = {
        kind: 'seed',
        id: s.id,
        x: sx,
        y: sy,
        session: s,
        radius: 20,
      }
      newSeedNodes.push(seedNode)

      const sessionMoves = moves.filter(m => m.session_id === s.id)

      const { points, movePositions } = computeRootPath(sx, sy, sessionMoves, i, sessions.length)

      newRootPaths.push({
        sessionId: s.id,
        points,
        moves: sessionMoves,
      })

      sessionMoves.forEach((mv, j) => {
        if (movePositions[j]) {
          newMoveNodes.push({
            kind: 'move',
            id: mv.id,
            x: movePositions[j].x,
            y: movePositions[j].y,
            move: mv,
            sessionId: s.id,
            radius: 8,
          })
        }
      })
    })

    // Links between parent-child sessions at seed level
    sessions.forEach(s => {
      if (s.parent_node_id) {
        const source = newSeedNodes.find(n => n.id === s.parent_node_id)
        const target = newSeedNodes.find(n => n.id === s.id)
        if (source && target) newLinks.push({ source, target })
      }
    })

    return { seedNodes: newSeedNodes, moveNodes: newMoveNodes, rootPaths: newRootPaths, links: newLinks }
  }, [computeRootPath])

  useEffect(() => {
    const { seedNodes: sn, moveNodes: mn, rootPaths: rp, links: l } = computeLayout(sessions, allMoves, dimensions.width, dimensions.height)
    setSeedNodes(sn)
    setMoveNodes(mn)
    setRootPaths(rp)
    setLinks(l)
    seedNodesRef.current = sn
    moveNodesRef.current = mn
  }, [sessions, allMoves, dimensions, computeLayout])

  useEffect(() => {
    seedNodesRef.current = seedNodes
    moveNodesRef.current = moveNodes
  }, [seedNodes, moveNodes])

  const MOVE_COLORS: Record<string, string> = {
    extend: '#6e9e8a',
    challenge: '#9e6e6e',
    pivot: '#7a6e9e',
  }

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

      // Ground line — where seeds sit
      ctx.beginPath()
      ctx.moveTo(-2000, 108)
      ctx.lineTo(2000, 108)
      ctx.strokeStyle = 'rgba(42, 42, 38, 0.4)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 8])
      ctx.stroke()
      ctx.setLineDash([])

      // Draw parent-child links between seeds (above ground)
      links.forEach(link => {
        ctx.beginPath()
        const midY = link.source.y - 40
        ctx.moveTo(link.source.x, link.source.y - link.source.radius)
        ctx.quadraticCurveTo(
          (link.source.x + link.target.x) / 2, midY,
          link.target.x, link.target.y - link.target.radius
        )
        ctx.strokeStyle = 'rgba(138, 114, 72, 0.5)'
        ctx.lineWidth = 1.5
        ctx.stroke()
      })

      // Draw root paths
      rootPaths.forEach(path => {
        if (path.points.length < 2) return
        const isSessionSelected = selected?.kind === 'seed' && selected.id === path.sessionId
        const isMoveSelected = selected?.kind === 'move' && selected.sessionId === path.sessionId
        const isRelated = isSessionSelected || isMoveSelected
        const isDimmed = selected && !isRelated

        ctx.globalAlpha = isDimmed ? 0.15 : 1

        // Draw the root as a tapering line with move colors
        for (let i = 0; i < path.points.length - 1; i++) {
          const from = path.points[i]
          const to = path.points[i + 1]
          const move = path.moves[i]
          const color = move ? MOVE_COLORS[move.move_type] || '#3a3a36' : '#2a2a26'
          const alpha = isRelated ? 0.9 : 0.5
          const width = Math.max(0.5, 3 - i * 0.3)

          ctx.beginPath()
          ctx.moveTo(from.x, from.y)

          // Smooth curve to next point
          if (i < path.points.length - 2) {
            const next = path.points[i + 2]
            const cpx = to.x
            const cpy = to.y
            ctx.quadraticCurveTo(cpx, cpy, (to.x + next.x) / 2, (to.y + next.y) / 2)
          } else {
            ctx.lineTo(to.x, to.y)
          }

          ctx.strokeStyle = isRelated ? color : `rgba(42, 42, 38, 0.8)`
          ctx.lineWidth = width
          ctx.stroke()

          // Fine root hairs at the end of each segment
          if (i === path.points.length - 2) {
            for (let h = 0; h < 3; h++) {
              const hairAngle = Math.atan2(to.y - from.y, to.x - from.x) + (h - 1) * 0.4
              const hairLen = 8 + h * 4
              ctx.beginPath()
              ctx.moveTo(to.x, to.y)
              ctx.lineTo(
                to.x + hairLen * Math.cos(hairAngle),
                to.y + hairLen * Math.sin(hairAngle)
              )
              ctx.strokeStyle = `rgba(42, 42, 38, 0.4)`
              ctx.lineWidth = 0.5
              ctx.stroke()
            }
          }
        }

        ctx.globalAlpha = 1
      })

      // Draw move nodes along the roots
      moveNodes.forEach(node => {
        const isSelected = selected?.id === node.id
        const parentSelected = (selected?.kind === 'seed' && selected.id === node.sessionId) ||
          (selected?.kind === 'move' && selected.sessionId === node.sessionId)
        const isDimmed = selected && !isSelected && !parentSelected

        ctx.globalAlpha = isDimmed ? 0.1 : parentSelected ? 1 : 0.7

        const color = MOVE_COLORS[node.move.move_type] || '#4a4a44'

        // Small organic node
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
        ctx.fillStyle = isSelected ? color + '33' : '#0f0f0d'
        ctx.fill()
        ctx.strokeStyle = isSelected || parentSelected ? color : '#2a2a26'
        ctx.lineWidth = isSelected ? 1.5 : 0.8
        ctx.stroke()

        const symbols: Record<string, string> = { extend: '→', challenge: '↔', pivot: '↑' }
        ctx.fillStyle = parentSelected || isSelected ? color : '#3a3a36'
        ctx.font = '400 7px DM Mono, monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(symbols[node.move.move_type] || '·', node.x, node.y)

        ctx.globalAlpha = 1
      })

      // Draw seed nodes at ground level
      seedNodes.forEach(node => {
        const isSelected = selected?.kind === 'seed' && selected.id === node.id
        const isDimmed = selected && selected.kind === 'seed' && selected.id !== node.id

        ctx.globalAlpha = isDimmed ? 0.3 : 1

        // Glow for complete
        if (node.session.status === 'complete') {
          const glow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.radius * 2.5)
          glow.addColorStop(0, 'rgba(200, 169, 110, 0.25)')
          glow.addColorStop(1, 'rgba(200, 169, 110, 0)')
          ctx.beginPath()
          ctx.arc(node.x, node.y, node.radius * 2.5, 0, Math.PI * 2)
          ctx.fillStyle = glow
          ctx.fill()
        }

        // Seed shape — small oval sitting on the ground line
        ctx.beginPath()
        ctx.ellipse(node.x, node.y, node.radius * 0.7, node.radius, 0, 0, Math.PI * 2)
        ctx.fillStyle = node.session.status === 'complete' ? '#1a1a14' : '#111110'
        ctx.fill()
        ctx.strokeStyle = isSelected ? '#c8a96e'
          : node.session.status === 'complete' ? '#8a7248' : '#3a3a36'
        ctx.lineWidth = isSelected ? 2 : 1.5
        ctx.stroke()

        // Mark
        ctx.fillStyle = node.session.status === 'complete' ? '#c8a96e' : '#4a4a44'
        ctx.font = node.session.status === 'complete' ? '500 10px DM Mono, monospace' : '400 8px DM Mono, monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(node.session.status === 'complete' ? '◆' : '·', node.x, node.y)

        // Label above seed
        const label = node.session.seed_problem.length > 20
          ? node.session.seed_problem.slice(0, 20) + '...'
          : node.session.seed_problem
        ctx.fillStyle = isSelected ? '#8a8578' : '#3a3a36'
        ctx.font = '400 9px DM Mono, monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        ctx.fillText(label, node.x, node.y - node.radius - 6)

        ctx.globalAlpha = 1
      })

      ctx.restore()
      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animRef.current)
  }, [seedNodes, moveNodes, rootPaths, links, selected, dimensions, zoom, pan])

  const toWorld = (x: number, y: number) => ({ x: (x - pan.x) / zoom, y: (y - pan.y) / zoom })

  const getNodeAt = (cx: number, cy: number): AnyNode | undefined => {
    const w = toWorld(cx, cy)
    const seed = seedNodesRef.current.find(n =>
      Math.sqrt(((n.x - w.x) / 0.7) ** 2 + (n.y - w.y) ** 2) < n.radius + 8
    )
    if (seed) return seed
    return moveNodesRef.current.find(n =>
      Math.sqrt((n.x - w.x) ** 2 + (n.y - w.y) ** 2) < n.radius + 8
    )
  }

  const handleWheel = (e: React.WheelEvent) => {
  e.preventDefault()
  const rect = canvasRef.current!.getBoundingClientRect()
  const mouseX = e.clientX - rect.left
  const mouseY = e.clientY - rect.top
  const delta = e.deltaY > 0 ? 0.9 : 1.1
  setZoom(z => {
    const newZoom = Math.max(0.2, Math.min(5, z * delta))
    setPan(p => ({
      x: mouseX - (mouseX - p.x) * (newZoom / z),
      y: mouseY - (mouseY - p.y) * (newZoom / z),
    }))
    return newZoom
  })
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
    if (isPanning.current) setPan({ x: e.clientX - lastPan.current.x, y: e.clientY - lastPan.current.y })
  }

  const handleMouseUp = () => { isPanning.current = false }

  const handleClick = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const node = getNodeAt(e.clientX - rect.left, e.clientY - rect.top)
    setSelected(node || null)
  }

  const selectedMoves = selected?.kind === 'seed'
    ? allMoves.filter(m => m.session_id === selected.id)
    : selected?.kind === 'move' ? [selected.move] : []

  return (
    <div style={{ width: '100vw', height: '100vh', background: 'var(--bg)', overflow: 'hidden', position: 'relative' }}>

      {/* Header */}
      <div style={{ position: 'absolute', top: '1.5rem', left: '50%', transform: 'translateX(-50%)', zIndex: 10, textAlign: 'center', pointerEvents: 'none' }}>
        <div style={{ fontSize: '1.4rem', fontWeight: 300, letterSpacing: '0.3em', color: 'var(--text-primary)' }}>ARBOR</div>
        <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.8rem', letterSpacing: '0.05em', marginTop: '0.2rem' }}>Where thinking blossoms into being.</div>
      </div>

      {/* Stats */}
      <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', zIndex: 10, fontFamily: 'DM Mono, monospace', fontSize: '0.62rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textAlign: 'right' }}>
        <div>{sessions.length} SESSION{sessions.length !== 1 ? 'S' : ''}</div>
        <div style={{ marginTop: '0.25rem', fontSize: '0.58rem' }}>LIVE</div>
      </div>

      {/* Legend */}
      <div style={{ position: 'absolute', top: '1.5rem', left: '1.5rem', zIndex: 10, fontFamily: 'DM Mono, monospace', fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '0.08em', lineHeight: '2' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><span style={{ color: '#6e9e8a' }}>→</span> EXTEND</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><span style={{ color: '#9e6e6e' }}>↔</span> CHALLENGE</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><span style={{ color: '#7a6e9e' }}>↑</span> PIVOT</div>
        <div style={{ marginTop: '0.5rem' }}>
          <a href="/relatability" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>RELATABILITY →</a>
        </div>
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

      {/* Empty state */}
      {sessions.length === 0 && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '1rem', marginBottom: '0.5rem' }}>The tree is empty.</div>
          <div style={{ color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', fontSize: '0.7rem' }}>Plant the first seed below.</div>
        </div>
      )}

      {/* Selected panel */}
      {selected && (
        <div style={{ position: 'absolute', top: '5rem', right: '1.5rem', width: '280px', maxHeight: 'calc(100vh - 8rem)', overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '4px', padding: '1.25rem', zIndex: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
              {selected.kind === 'seed'
                ? (selected.session.status === 'complete' ? '◆ NODE' : '○ IN PROGRESS')
                : `${selected.move.move_type.toUpperCase()} · ${selected.move.role.toUpperCase()}`}
            </div>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'DM Mono, monospace', fontSize: '0.6rem' }}>✕</button>
          </div>

          <div style={{ color: 'var(--text-primary)', fontSize: '0.9rem', marginBottom: '0.75rem', lineHeight: '1.6' }}>
            {selected.kind === 'seed' ? selected.session.seed_problem : selected.move.content}
          </div>

          {selected.kind === 'seed' && selected.session.seed_reframing && (
            <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.8rem', marginBottom: '0.75rem', lineHeight: '1.5', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
              ↳ {selected.session.seed_reframing}
            </div>
          )}

          {selected.kind === 'seed' && selected.session.node_statement && (
            <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.82rem', marginBottom: '0.5rem', lineHeight: '1.5', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
              {selected.session.node_statement}
            </div>
          )}

          {selected.kind === 'seed' && selected.session.open_question && (
            <div style={{ color: 'var(--accent-dim)', fontSize: '0.8rem', fontStyle: 'italic', marginBottom: '1rem', lineHeight: '1.5' }}>
              ↳ {selected.session.open_question}
            </div>
          )}

          {/* Move flow */}
          {selectedMoves.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginBottom: '0.75rem' }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.58rem', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                ROOT FLOW — {selectedMoves.length} MOVES
              </div>
              {selectedMoves.map((mv, i) => {
                const color = MOVE_COLORS[mv.move_type] || '#4a4a44'
                const symbol = { extend: '→', challenge: '↔', pivot: '↑' }[mv.move_type] || '·'
                const isThisMove = selected.kind === 'move' && selected.id === mv.id
                return (
                  <div key={mv.id} style={{ marginBottom: '0.4rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start', opacity: isThisMove ? 1 : 0.7 }}>
                    <span style={{ color, fontFamily: 'DM Mono, monospace', fontSize: '0.7rem', flexShrink: 0, marginTop: '0.1rem' }}>{symbol}</span>
                    <div style={{ color: mv.role === 'human' ? 'var(--text-secondary)' : 'var(--text-muted)', fontSize: '0.78rem', lineHeight: '1.4', fontStyle: mv.role === 'ai' ? 'italic' : 'normal' }}>
                      {mv.content.length > 70 ? mv.content.slice(0, 70) + '...' : mv.content}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <a href={`/session/${selected.kind === 'seed' ? selected.id : selected.sessionId}`}
              style={{ flex: 1, display: 'block', textAlign: 'center', padding: '0.5rem', background: 'var(--accent)', color: 'var(--bg)', borderRadius: '3px', fontFamily: 'DM Mono, monospace', fontSize: '0.6rem', letterSpacing: '0.08em', textDecoration: 'none' }}>
              OPEN
            </a>
            {selected.kind === 'seed' && selected.session.status === 'complete' && (
              <a href={`/seed?parent=${selected.id}`}
                style={{ flex: 1, display: 'block', textAlign: 'center', padding: '0.5rem', background: 'transparent', color: 'var(--accent)', border: '1px solid var(--accent-dim)', borderRadius: '3px', fontFamily: 'DM Mono, monospace', fontSize: '0.6rem', letterSpacing: '0.08em', textDecoration: 'none' }}>
                BRANCH →
              </a>
            )}
          </div>
        </div>
      )}

      {/* Seed button */}
      <div style={{ position: 'absolute', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
        <a href="/seed"
          style={{ display: 'block', padding: '0.6rem 2rem', background: 'transparent', color: 'var(--accent)', border: '1px solid var(--accent-dim)', borderRadius: '3px', fontFamily: 'DM Mono, monospace', fontSize: '0.7rem', letterSpacing: '0.15em', textDecoration: 'none', textAlign: 'center' }}>
          + SEED YOUR INQUIRY
        </a>
      </div>
    </div>
  )
}
