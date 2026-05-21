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
  const [nodeStatement, setNodeStatement] = useState('')
  const [crystallizing, setCrystallizing] = useState(false)
  const [timeLeft, setTimeLeft] = useState(90)
  const [timerActive, setTimerActive] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => { fetchSession() }, [id])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [moves])
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
    if (!input.trim() || !selectedMove || loading || selectedMove === lastMoveType) return
    setLoading(true)
    setTimerActiv
