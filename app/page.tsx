'use client'
import React, { useEffect, useState, useRef, useCallback } from 'react'
import { supabase, Session } from '@/lib/supabase'

type Node = {
  id: string
  x: number
  y: number
  session: Session
  radius: number
  depth: number
}

type Link = {
  source: Node
  target: Node
}

export default function Home() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [nodes, setNodes] = useState<Node[]>([])
  const [links, setLinks] = useState<Link[]>([])
  const [selected, setSelected] = useState<Session | null>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const nodesRef = useRef<Node[]>([])

  useEffect(() => {
    const update = () => setDimensions({ width: window.innerWidth, height: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    fetchSessions()
    const interval = setInterval(fetchSessions, 5000)
    return () => clearInterval(interval)
  }, [])

  const fetchSessions = async () => {
    const { data } = await supabase.from('sessions').select('*').order('created_at', { ascending: true })
    if (data) setSessions(data)
  }

  // Layout: roots at top, children spread below
  const computeLayout = useCallback((sessions: Session[], width: number, height: number) => {
    const roots = sessions.filter(s => !s.parent_node_id)
    const getChildren = (id: string) => sessions.filter(s => s.parent_node_id === id)

    const newNodes: Node[] = []
    const newLinks: Link[] = []

    const PADDING_TOP = 120
    const PADDING_BOTTOM = 100
    const availableHeight = height - PADDING_TOP - PADDING_BOTTOM

    // BFS to assign depths
    const depthMap = new Map<string, number>()
    const queue = roots.map(r => ({ id: r.id, depth: 0 }))
    while (queue.length > 0) {
      const { id, depth } = queue.shift()!
      depthMap.set(id, depth)
      getChildren(id).forEach(child => queue.push({ id: child.id, depth: depth + 1 }))
    }

    const maxDepth = Math.max(...Array.from(depthMap.values()), 0)
    const depthY = (depth: number) =>
      PADDING_TOP + (maxDepth === 0 ? availableHeight / 2 : (depth / maxDepth) * availableHeight)

    // Group by depth
    const byDepth = new Map<number, Session[]>()
    sessions.forEach(s => {
      const d = depthMap.get(s.id) ?? 0
      if (!byDepth.has(d)) byDepth.set(d, [])
      byDepth.get(d)!.push(s)
    })

    const nodeMap = new Map<string, Node>()

    byDepth.forEach((group, depth) => {
      const y = depthY(depth)
      const spacing = width / (group.length + 1)
      group.forEach((s, i) => {
        const node: Node = {
          id: s.id,
          x: spacing * (i + 1),
          y,
          session: s,
          radius: s.status === 'complete' ? 28 : 20,
          depth,
        }
        newNodes.push(node)
        nodeMap.set(s.id, node)
      })
    })

    // Build links
    sessions.forEach(s => {
      if (s.parent_node_id) {
        const source = nodeMap.get(s.parent_node_id)
        const target = nodeMap.get(s.id)
        if (source && target) newLinks.push({ source, target })
      }
    })

    return { nodes: newNodes, links: newLinks }
  }, [])

  useEffect(() => {
    const { nodes: n, links: l } = computeLayout(sessions, dimensions.width, dimensions.height)
    setNodes(n)
    setLinks(l)
    nodesRef.current = n
  }, [sessions, dimensions, computeLayout])

  useEffect(() => { nodesRef.current = nodes }, [nodes])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      ctx.clearRect(0, 0, dimensions.width, dimensions.height)

      // Draw links as curved lines
      links.forEach(link => {
        const { source, target } = link
        const cp1x = source.x
        const cp1y = source.y + (target.y - source.y) * 0.4
        const cp2x = target.x
        const cp2y = source.y + (target.y - source.y) * 0.6

        ctx.beginPath()
        ctx.moveTo(source.x, source.y + source.radius)
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, target.x, target.y - target.radius)
        ctx.strokeStyle = 'rgba(58, 58, 54, 0.9)'
        ctx.lineWidth = 1.5
        ctx.stroke()

        // Arrow tip
        const angle = Math.atan2(target.y - cp2y, target.x - cp2x)
        ctx.beginPath()
        ctx.moveTo(target.x - target.radius * Math.cos(angle), target.y - target.radius * Math.sin(angle))
        ctx.lineTo(
          target.x - target.radius * Math.cos(angle) - 8 * Math.cos(angle - 0.4),
          target.y - target.radius * Math.sin(angle) - 8 * Math.sin(angle - 0.4)
        )
        ctx.lineTo(
          target.x - target.radius * Math.cos(angle) - 8 * Math.cos(angle + 0.4),
          target.y - target.radius * Math.sin(angle) - 8 * Math.sin(angle + 0.4)
        )
        ctx.closePath()
        ctx.fillStyle = 'rgba(58, 58, 54, 0.9)'
        ctx.fill()
      })

      // Draw nodes
      nodes.forEach(node => {
        const isComplete = node.session.status === 'complete'
        const isSelected = selected?.id === node.id

        // Glow
        if (isComplete) {
          const glow = ctx.createRadialGradient(node.x, node.y, node.radius, node.x, node.y, node.radius + 16)
          glow.addColorStop(0, 'rgba(200, 169, 110, 0.2)')
          glow.addColorStop(1, 'rgba(200, 169, 110, 0)')
          ctx.beginPath()
          ctx.arc(node.x, node.y, node.radius + 16, 0, Math.PI * 2)
          ctx.fillStyle = glow
          ctx.fill()
        }

        // Circle
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
        ctx.fillStyle = isComplete ? '#1a1a16' : '#111110'
        ctx.fill()
        ctx.strokeStyle = isSelected ? '#c8a96e' : isComplete ? '#8a7248' : '#3a3a36'
        ctx.lineWidth = isSelected ? 2.5 : 1.5
        ctx.stroke()

        // Icon
        ctx.fillStyle = isComplete ? '#c8a96e' : '#4a4a44'
        ctx.font = isComplete ? '500 12px DM Mono, monospace' : '400 10px DM Mono, monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(isComplete ? '◆' : '○', node.x, node.y)

        // Seed label
        const label = node.session.seed_problem.length > 22
          ? node.session.seed_problem.slice(0, 22) + '...'
          : node.session.seed_problem
        ctx.fillStyle = isSelected ? '#8a8578' : '#4a4a44'
        ctx.font = '400 9px DM Mono, monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(label, node.x, node.y + node.radius + 8)
      })

      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animRef.current)
  }, [nodes, links, selected, dimensions])

  const getNodeAt = (x: number, y: number) =>
    nodesRef.current.find(n => Math.sqrt((n.x - x) ** 2 + (n.y - y) ** 2) < n.radius + 12)

  const handleClick = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const node = getNodeAt(e.clientX - rect.left, e.clientY - rect.top)
    setSelected(node ? node.session : null)
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
      <div style={{ position: 'absolute', top: '1.5rem', left: '1.5rem', zIndex: 10, fontFamily: 'DM Mono, monospace', fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
          <span style={{ color: 'var(--accent)' }}>◆</span> CRYSTALLISED
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>○</span> IN PROGRESS
        </div>
      </div>

      {/* Relatability link */}
<div style={{ position: 'absolute', top: '6rem', left: '1.5rem', zIndex: 10 }}>
  <a href="/relatability" style={{ color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', fontSize: '0.6rem', letterSpacing: '0.08em', textDecoration: 'none' }}>
    RELATABILITY MAP →
  </a>
</div>
      
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        onClick={handleClick}
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
        <div style={{ position: 'absolute', bottom: '4.5rem', right: '1.5rem', width: '300px', background: 'var(--bg-card)', border: '1px solid ' + (selected.status === 'complete' ? 'var(--accent-dim)' : 'var(--border)'), borderRadius: '4px', padding: '1.25rem', zIndex: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
              {selected.status === 'complete' ? '◆ NODE' : '○ IN PROGRESS'}
            </div>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'DM Mono, monospace', fontSize: '0.6rem' }}>✕</button>
          </div>
          <div style={{ color: 'var(--text-primary)', fontSize: '0.95rem', marginBottom: '0.75rem', lineHeight: '1.5' }}>
            {selected.seed_problem}
          </div>
          {selected.node_statement && (
            <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.85rem', marginBottom: '0.75rem', lineHeight: '1.5', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
              {selected.node_statement}
            </div>
          )}
          {selected.open_question && (
            <div style={{ color: 'var(--accent-dim)', fontSize: '0.82rem', fontStyle: 'italic', marginBottom: '1rem', lineHeight: '1.5' }}>
              ↳ {selected.open_question}
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <a href={`/session/${selected.id}`}
              style={{ flex: 1, display: 'block', textAlign: 'center', padding: '0.5rem', background: 'var(--accent)', color: 'var(--bg)', borderRadius: '3px', fontFamily: 'DM Mono, monospace', fontSize: '0.6rem', letterSpacing: '0.08em', textDecoration: 'none' }}>
              OPEN
            </a>
            {selected.status === 'complete' && (
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
