'use client'
import React, { useEffect, useState, useRef } from 'react'
import { supabase, Session } from '@/lib/supabase'

type Node = {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  session: Session
  radius: number
}

type Link = {
  source: string
  target: string
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
  const isDragging = useRef<string | null>(null)

  useEffect(() => {
    const updateDimensions = () => setDimensions({ width: window.innerWidth, height: window.innerHeight })
    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
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

  useEffect(() => {
    const newLinks: Link[] = sessions
      .filter(s => s.parent_node_id)
      .map(s => ({ source: s.parent_node_id!, target: s.id }))
    setLinks(newLinks)

    setNodes(prev => {
      const existing = new Map(prev.map(n => [n.id, n]))
      return sessions.map(s => {
        if (existing.has(s.id)) return { ...existing.get(s.id)!, session: s }
        return {
          id: s.id,
          x: dimensions.width / 2 + (Math.random() - 0.5) * 200,
          y: dimensions.height / 2 + (Math.random() - 0.5) * 200,
          vx: 0, vy: 0,
          session: s,
          radius: s.status === 'complete' ? 28 : 20,
        }
      })
    })
  }, [sessions, dimensions])

  useEffect(() => { nodesRef.current = nodes }, [nodes])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const simulate = () => {
      const ns = [...nodesRef.current]
      const cx = dimensions.width / 2
      const cy = dimensions.height / 2

      for (let i = 0; i < ns.length; i++) {
        if (isDragging.current === ns[i].id) continue

        ns[i].vx += (cx - ns[i].x) * 0.002
        ns[i].vy += (cy - ns[i].y) * 0.002

        for (let j = 0; j < ns.length; j++) {
          if (i === j) continue
          const dx = ns[i].x - ns[j].x
          const dy = ns[i].y - ns[j].y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const minDist = ns[i].radius + ns[j].radius + 60
          if (dist < minDist) {
            const force = (minDist - dist) / dist * 0.3
            ns[i].vx += dx * force
            ns[i].vy += dy * force
          }
        }

        links.forEach(link => {
          let other: Node | undefined
          if (link.source === ns[i].id) other = ns.find(n => n.id === link.target)
          if (link.target === ns[i].id) other = ns.find(n => n.id === link.source)
          if (other) {
            const dx = other.x - ns[i].x
            const dy = other.y - ns[i].y
            const dist = Math.sqrt(dx * dx + dy * dy) || 1
            const force = (dist - 140) / dist * 0.05
            ns[i].vx += dx * force
            ns[i].vy += dy * force
          }
        })

        ns[i].vx *= 0.85
        ns[i].vy *= 0.85
        ns[i].x += ns[i].vx
        ns[i].y += ns[i].vy
        ns[i].x = Math.max(ns[i].radius + 10, Math.min(dimensions.width - ns[i].radius - 10, ns[i].x))
        ns[i].y = Math.max(ns[i].radius + 40, Math.min(dimensions.height - ns[i].radius - 80, ns[i].y))
      }

      ctx.clearRect(0, 0, dimensions.width, dimensions.height)

      links.forEach(link => {
        const source = ns.find(n => n.id === link.source)
        const target = ns.find(n => n.id === link.target)
        if (!source || !target) return
        ctx.beginPath()
        ctx.moveTo(source.x, source.y)
        ctx.lineTo(target.x, target.y)
        ctx.strokeStyle = 'rgba(42, 42, 38, 0.8)'
        ctx.lineWidth = 1
        ctx.stroke()
      })

      ns.forEach(node => {
        const isComplete = node.session.status === 'complete'
        const isSelected = selected?.id === node.id

        if (isComplete) {
          ctx.beginPath()
          ctx.arc(node.x, node.y, node.radius + 8, 0, Math.PI * 2)
          const glow = ctx.createRadialGradient(node.x, node.y, node.radius, node.x, node.y, node.radius + 8)
          glow.addColorStop(0, 'rgba(200, 169, 110, 0.15)')
          glow.addColorStop(1, 'rgba(200, 169, 110, 0)')
          ctx.fillStyle = glow
          ctx.fill()
        }

        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
        ctx.fillStyle = isComplete ? '#1a1a16' : '#111110'
        ctx.fill()
        ctx.strokeStyle = isSelected ? '#c8a96e' : isComplete ? '#8a7248' : '#2a2a26'
        ctx.lineWidth = isSelected ? 2 : 1
        ctx.stroke()

        ctx.fillStyle = isComplete ? '#c8a96e' : '#4a4a44'
        ctx.font = isComplete ? '500 11px DM Mono, monospace' : '400 10px DM Mono, monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(isComplete ? '◆' : '○', node.x, node.y)

        const label = node.session.seed_problem.length > 24
          ? node.session.seed_problem.slice(0, 24) + '...'
          : node.session.seed_problem
        ctx.fillStyle = '#4a4a44'
        ctx.font = '400 9px DM Mono, monospace'
        ctx.textAlign = 'center'
        ctx.fillText(label, node.x, node.y + node.radius + 12)
      })

      nodesRef.current = ns
      animRef.current = requestAnimationFrame(simulate)
    }

    animRef.current = requestAnimationFrame(simulate)
    return () => cancelAnimationFrame(animRef.current)
  }, [links, dimensions, selected])

  const getNodeAt = (x: number, y: number) =>
    nodesRef.current.find(n => Math.sqrt((n.x - x) ** 2 + (n.y - y) ** 2) < n.radius + 10)

  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const node = getNodeAt(e.clientX - rect.left, e.clientY - rect.top)
    if (node) { isDragging.current = node.id; setSelected(node.session) }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    if (isDragging.current) {
      nodesRef.current = nodesRef.current.map(n =>
        n.id === isDragging.current ? { ...n, x, y, vx: 0, vy: 0 } : n
      )
    }
  }

  const handleMouseUp = () => { isDragging.current = null }

  const handleClick = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const node = getNodeAt(e.clientX - rect.left, e.clientY - rect.top)
    setSelected(node ? node.session : null)
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: 'var(--bg)', overflow: 'hidden', position: 'relative' }}>

      {/* Header */}
      <div style={{ position: 'absolute', top: '1.5rem', left: '50%', transform: 'translateX(-50%)', zIndex: 10, textAlign: 'center' }}>
        <div style={{ fontSize: '1.4rem', fontWeight: 300, letterSpacing: '0.3em', color: 'var(--text-primary)' }}>ARBOR</div>
        <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.8rem', letterSpacing: '0.05em', marginTop: '0.2rem' }}>Where thinking blossoms into being.</div>
      </div>

      {/* Session count */}
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

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
        style={{ cursor: 'crosshair', display: 'block' }}
      />

      {/* Empty state */}
      {sessions.length === 0 && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '1rem', marginBottom: '0.5rem' }}>The tree is empty.</div>
          <div style={{ color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', fontSize: '0.7rem' }}>Plant the first seed below.</div>
        </div>
      )}

      {/* Selected node panel */}
      {selected && (
        <div style={{ position: 'absolute', bottom: '4rem', right: '1.5rem', width: '300px', background: 'var(--bg-card)', border: '1px solid ' + (selected.status === 'complete' ? 'var(--accent-dim)' : 'var(--border)'), borderRadius: '4px', padding: '1.25rem', zIndex: 10 }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>
            {selected.status === 'complete' ? '◆ NODE' : '○ IN PROGRESS'}
          </div>
          <div style={{ color: 'var(--text-primary)', fontSize: '0.95rem', marginBottom: '0.75rem', lineHeight: '1.5' }}>
            {selected.seed_problem}
          </div>
          {selected.node_statement && (
            <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.85rem', marginBottom: '0.75rem', lineHeight: '1.5' }}>
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
              <a href={`/session/new?parent=${selected.id}`}
                style={{ flex: 1, display: 'block', textAlign: 'center', padding: '0.5rem', background: 'transparent', color: 'var(--accent)', border: '1px solid var(--accent-dim)', borderRadius: '3px', fontFamily: 'DM Mono, monospace', fontSize: '0.6rem', letterSpacing: '0.08em', textDecoration: 'none' }}>
                BRANCH →
              </a>
            )}
          </div>
        </div>
      )}

      {/* Seed button — bottom center */}
      <div style={{ position: 'absolute', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
        <a href="/seed"
          style={{ display: 'block', padding: '0.6rem 2rem', background: 'transparent', color: 'var(--accent)', border: '1px solid var(--accent-dim)', borderRadius: '3px', fontFamily: 'DM Mono, monospace', fontSize: '0.7rem', letterSpacing: '0.15em', textDecoration: 'none', textAlign: 'center' }}>
          + SEED YOUR INQUIRY
        </a>
      </div>
    </div>
  )
}
