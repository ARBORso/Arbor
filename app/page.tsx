'use client'
import React, { useEffect, useState, useRef, useCallback } from 'react'
import { supabase, Session, Move } from '@/lib/supabase'

type NodeShape = { points: { x: number; y: number }[] }

type SeedNode = {
  kind: 'seed'
  id: string
  x: number
  y: number
  session: Session
  radius: number
  shape: NodeShape
  moves: Move[]
}

type MoveNode = {
  kind: 'move'
  id: string
  x: number
  y: number
  move: Move
  sessionId: string
  angle: number
  length: number
}

type AnyNode = SeedNode | MoveNode
type Link = { source: SeedNode; target: SeedNode }

// Generate branching tree shape from moves
function generateTreeShape(moves: Move[], radius: number): NodeShape {
  const points: { x: number; y: number }[] = []
  const trunk = radius * 0.4

  // Trunk base points
  points.push({ x: -trunk * 0.3, y: radius * 0.5 })
  points.push({ x: trunk * 0.3, y: radius * 0.5 })

  // Build branches from moves
  const extendMoves = moves.filter(m => m.move_type === 'extend')
  const challengeMoves = moves.filter(m => m.move_type === 'challenge')
  const pivotMoves = moves.filter(m => m.move_type === 'pivot')

  // Extend moves grow upward
  extendMoves.forEach((_, i) => {
    const t = (i + 1) / (extendMoves.length + 1)
    const h = radius * (0.4 - t * 0.8)
    const spread = trunk * (1 - t * 0.6)
    points.push({ x: spread, y: h })
    points.push({ x: -spread, y: h - radius * 0.15 })
  })

  // Challenge moves grow sideways
  challengeMoves.forEach((_, i) => {
    const side = i % 2 === 0 ? 1 : -1
    const t = (i + 1) / (challengeMoves.length + 1)
    points.push({ x: side * radius * (0.6 + t * 0.3), y: -radius * 0.1 * t })
    points.push({ x: side * radius * 0.4, y: -radius * 0.3 })
  })

  // Pivot moves grow at unexpected angles
  pivotMoves.forEach((_, i) => {
    const angle = (i * 137.5 * Math.PI) / 180 // golden angle
    const r = radius * (0.5 + i * 0.1)
    points.push({ x: r * Math.cos(angle), y: r * Math.sin(angle) - radius * 0.1 })
  })

  // Always add a crown
  const crownPoints = 5
  for (let i = 0; i < crownPoints; i++) {
    const a = (i / crownPoints) * Math.PI * 2 - Math.PI / 2
    const r = radius * (0.7 + Math.sin(i * 2.3) * 0.2)
    points.push({ x: r * Math.cos(a) * 0.8, y: r * Math.sin(a) - radius * 0.1 })
  }

  return { points }
}

// Draw organic blob for move nodes
function drawBlob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number) {
  const points = 8
  ctx.beginPath()
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * Math.PI * 2
    const noise = 0.7 + 0.3 * Math.sin(seed + i * 2.1) * Math.cos(seed * 0.7 + i)
    const px = x + r * noise * Math.cos(angle)
    const py = y + r * noise * Math.sin(angle)
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
}

// Draw tree shape
function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, shape: NodeShape, scale = 1) {
  if (shape.points.length < 3) return
  const hull = convexHull(shape.points)
  if (hull.length < 3) return

  ctx.beginPath()
  // Smooth the hull with bezier curves
  for (let i = 0; i < hull.length; i++) {
    const curr = hull[i]
    const next = hull[(i + 1) % hull.length]
    const mid = { x: (curr.x + next.x) / 2, y: (curr.y + next.y) / 2 }
    if (i === 0) ctx.moveTo(x + curr.x * scale, y + curr.y * scale)
    ctx.quadraticCurveTo(x + curr.x * scale, y + curr.y * scale, x + mid.x * scale, y + mid.y * scale)
  }
  ctx.closePath()
}

// Simple convex hull (Graham scan simplified)
function convexHull(points: { x: number; y: number }[]) {
  if (points.length < 3) return points
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (O: any, A: any, B: any) => (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x)
  const lower: any[] = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: any[] = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

export default function Home() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [allMoves, setAllMoves] = useState<Move[]>([])
  const [seedNodes, setSeedNodes] = useState<SeedNode[]>([])
  const [moveNodes, setMoveNodes] = useState<MoveNode[]>([])
  const [links, setLinks] = useState<Link[]>([])
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

  const computeLayout = useCallback((sessions: Session[], moves: Move[], width: number, height: number) => {
    const cx = width / 2
    const cy = height / 2
    const orbitRadius = Math.min(width, height) * 0.32
    const newSeedNodes: SeedNode[] = []
    const newMoveNodes: MoveNode[] = []
    const newLinks: Link[] = []

    sessions.forEach((s, i) => {
      const angle = (i / sessions.length) * Math.PI * 2 - Math.PI / 2
      const sx = cx + orbitRadius * Math.cos(angle)
      const sy = cy + orbitRadius * Math.sin(angle)
      const sessionMoves = moves.filter(m => m.session_id === s.id)
      const radius = 32 + sessionMoves.length * 2

      const seedNode: SeedNode = {
        kind: 'seed',
        id: s.id,
        x: sx,
        y: sy,
        session: s,
        radius,
        shape: generateTreeShape(sessionMoves, radius),
        moves: sessionMoves,
      }
      newSeedNodes.push(seedNode)

      // Move nodes as branches
      sessionMoves.forEach((mv, j) => {
        const branchAngle = angle + ((j - (sessionMoves.length - 1) / 2) * 0.4)
        const branchLength = radius + 30 + j * 8
        newMoveNodes.push({
          kind: 'move',
          id: mv.id,
          x: sx + branchLength * Math.cos(branchAngle),
          y: sy + branchLength * Math.sin(branchAngle),
          move: mv,
          sessionId: s.id,
          angle: branchAngle,
          length: branchLength,
        })
      })
    })

    // Links between connected sessions
    sessions.forEach(s => {
      if (s.parent_node_id) {
        const source = newSeedNodes.find(n => n.id === s.parent_node_id)
        const target = newSeedNodes.find(n => n.id === s.id)
        if (source && target) newLinks.push({ source, target })
      }
    })

    return { seedNodes: newSeedNodes, moveNodes: newMoveNodes, links: newLinks }
  }, [])

  useEffect(() => {
    const { seedNodes: sn, moveNodes: mn, links: l } = computeLayout(sessions, allMoves, dimensions.width, dimensions.height)
    setSeedNodes(sn)
    setMoveNodes(mn)
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

      // Draw parent-child links
      links.forEach(link => {
        ctx.beginPath()
        const cp1x = link.source.x
        const cp1y = link.source.y + (link.target.y - link.source.y) * 0.5
        const cp2x = link.target.x
        const cp2y = link.source.y + (link.target.y - link.source.y) * 0.5
        ctx.moveTo(link.source.x, link.source.y)
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, link.target.x, link.target.y)
        ctx.strokeStyle = 'rgba(138, 114, 72, 0.4)'
        ctx.lineWidth = 2
        ctx.stroke()
      })

      // Draw move branches as organic lines from seed
      moveNodes.forEach(mv => {
        const parent = seedNodesRef.current.find(s => s.id === mv.sessionId)
        if (!parent) return
        const isSelectedMove = selected?.id === mv.id
        const parentSelected = selected?.kind === 'seed' && selected.id === mv.sessionId
        const color = MOVE_COLORS[mv.move.move_type] || '#4a4a44'

        ctx.beginPath()
        // Organic curved branch
        const ctrl1x = parent.x + (mv.x - parent.x) * 0.3 + Math.sin(mv.angle) * 15
        const ctrl1y = parent.y + (mv.y - parent.y) * 0.3 - Math.cos(mv.angle) * 15
        ctx.moveTo(parent.x, parent.y)
        ctx.quadraticCurveTo(ctrl1x, ctrl1y, mv.x, mv.y)
        ctx.strokeStyle = isSelectedMove || parentSelected
          ? color
          : 'rgba(42, 42, 38, 0.6)'
        ctx.lineWidth = isSelectedMove ? 2 : 1
        ctx.stroke()
      })

      // Draw seed nodes as organic tree shapes
      seedNodes.forEach(node => {
        const isSelected = selected?.kind === 'seed' && selected.id === node.id
        const isDimmed = selected && selected.kind === 'seed' && selected.id !== node.id

        ctx.globalAlpha = isDimmed ? 0.3 : 1

        // Glow
        if (isSelected || node.session.status === 'complete') {
          const glow = ctx.createRadialGradient(node.x, node.y, node.radius * 0.5, node.x, node.y, node.radius * 1.8)
          glow.addColorStop(0, node.session.status === 'complete'
            ? 'rgba(200, 169, 110, 0.2)'
            : 'rgba(138, 133, 120, 0.1)')
          glow.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.beginPath()
          ctx.arc(node.x, node.y, node.radius * 1.8, 0, Math.PI * 2)
          ctx.fillStyle = glow
          ctx.fill()
        }

        // Draw tree shape
        drawTree(ctx, node.x, node.y, node.shape)
        ctx.fillStyle = node.session.status === 'complete' ? '#1a1a14' : '#0f0f0d'
        ctx.fill()
        ctx.strokeStyle = isSelected ? '#c8a96e'
          : node.session.status === 'complete' ? '#8a7248' : '#2a2a26'
        ctx.lineWidth = isSelected ? 2 : 1
        ctx.stroke()

        // Inner mark
        ctx.fillStyle = node.session.status === 'complete' ? '#c8a96e' : '#3a3a36'
        ctx.font = node.session.status === 'complete' ? '500 11px DM Mono, monospace' : '400 9px DM Mono, monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(node.session.status === 'complete' ? '◆' : '·', node.x, node.y)

        // Label
        const label = node.session.seed_problem.length > 22
          ? node.session.seed_problem.slice(0, 22) + '...'
          : node.session.seed_problem
        ctx.fillStyle = isSelected ? '#8a8578' : '#3a3a36'
        ctx.font = '400 9px DM Mono, monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(label, node.x, node.y + node.radius + 10)

        ctx.globalAlpha = 1
      })

      // Draw move nodes as organic blobs
      moveNodes.forEach(node => {
        const isSelected = selected?.id === node.id
        const parentSelected = selected?.kind === 'seed' && selected.id === node.sessionId
        const isDimmed = selected && !isSelected && !parentSelected

        ctx.globalAlpha = isDimmed ? 0.1 : parentSelected ? 0.9 : 0.6

        const color = MOVE_COLORS[node.move.move_type] || '#4a4a44'
        const blobSeed = node.id.charCodeAt(0) + node.id.charCodeAt(1)

        drawBlob(ctx, node.x, node.y, 8, blobSeed)
        ctx.fillStyle = isSelected ? color + '44' : '#111110'
        ctx.fill()
        ctx.strokeStyle = isSelected || parentSelected ? color : '#2a2a26'
        ctx.lineWidth = isSelected ? 1.5 : 0.8
        ctx.stroke()

        // Move symbol
        const symbols: Record<string, string> = { extend: '→', challenge: '↔', pivot: '↑' }
        ctx.fillStyle = parentSelected || isSelected ? color : '#3a3a36'
        ctx.font = '400 7px DM Mono, monospace'
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
  }, [seedNodes, moveNodes, links, selected, dimensions, zoom, pan])

  const toWorld = (x: number, y: number) => ({ x: (x - pan.x) / zoom, y: (y - pan.y) / zoom })

  const getNodeAt = (cx: number, cy: number): AnyNode | undefined => {
    const w = toWorld(cx, cy)
    const seed = seedNodesRef.current.find(n => Math.sqrt((n.x - w.x) ** 2 + (n.y - w.y) ** 2) < n.radius + 10)
    if (seed) return seed
    return moveNodesRef.current.find(n => Math.sqrt((n.x - w.x) ** 2 + (n.y - w.y) ** 2) < 14)
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    setZoom(z => Math.max(0.2, Math.min(5, z * (e.deltaY > 0 ? 0.9 : 1.1))))
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
          <a href="/relatability" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>RELATABILITY MAP →</a>
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

          {selected.kind === 'seed' && selected.session.node_statement && (
            <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.82rem', marginBottom: '0.75rem', lineHeight: '1.5', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
              {selected.session.node_statement}
            </div>
          )}

          {selected.kind === 'seed' && selected.session.open_question && (
            <div style={{ color: 'var(--accent-dim)', fontSize: '0.8rem', fontStyle: 'italic', marginBottom: '1rem', lineHeight: '1.5' }}>
              ↳ {selected.session.open_question}
            </div>
          )}

          {selected.kind === 'seed' && selected.moves.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginBottom: '0.75rem' }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.58rem', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                {selected.moves.length} MOVES
              </div>
              {selected.moves.map((mv, i) => {
                const color = { extend: '#6e9e8a', challenge: '#9e6e6e', pivot: '#7a6e9e' }[mv.move_type] || '#4a4a44'
                const symbol = { extend: '→', challenge: '↔', pivot: '↑' }[mv.move_type] || '·'
                return (
                  <div key={mv.id} style={{ marginBottom: '0.4rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                    <span style={{ color, fontFamily: 'DM Mono, monospace', fontSize: '0.7rem', flexShrink: 0, marginTop: '0.1rem' }}>{symbol}</span>
                    <div style={{ color: mv.role === 'human' ? 'var(--text-secondary)' : 'var(--text-muted)', fontSize: '0.78rem', lineHeight: '1.4', fontStyle: mv.role === 'ai' ? 'italic' : 'normal' }}>
                      {mv.content.length > 60 ? mv.content.slice(0, 60) + '...' : mv.content}
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
