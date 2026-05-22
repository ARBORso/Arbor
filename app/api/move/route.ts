import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase, Move, MoveType } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MOVE_DESCRIPTIONS = {
  extend: '→ Extend: build forward on what was just said',
  challenge: '↔ Challenge: find the tension or contradiction',
  pivot: '↑ Pivot: make an unexpected but genuinely connected leap'
}

async function withRetry<T>(fn: () => Promise<T>, retries = 4, delay = 3000): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (e: any) {
      if ((e?.status === 529 || e?.status === 500) && i < retries - 1) {
        await new Promise(res => setTimeout(res, delay))
        continue
      }
      throw e
    }
  }
  throw new Error('Max retries exceeded')
}

export async function POST(req: NextRequest) {
  const { session_id, content, move_type, turn } = await req.json()

  await supabase.from('moves').insert({
    session_id, turn, role: 'human', move_type, content
  })

  const { data: session } = await supabase
    .from('sessions').select('*').eq('id', session_id).single()

  const { data: moves } = await supabase
    .from('moves').select('*').eq('session_id', session_id).order('turn', { ascending: true })

  const moveTypes: MoveType[] = ['extend', 'challenge', 'pivot']
  const availableMoves = moveTypes.filter(m => m !== move_type)
  const aiMoveType = availableMoves[Math.floor(Math.random() * availableMoves.length)]

  const conversationHistory = (moves || []).map((m: Move) => ({
    role: m.role === 'human' ? 'user' as const : 'assistant' as const,
    content: `[${m.move_type.toUpperCase()}] ${m.content}`
  }))

  const aiResponse = await withRetry(() => anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1000,
    system: `You are a participant in Arbor — a game of collaborative thought.
    
The seed problem: "${session?.seed_problem}"
The reframing you offered: "${session?.seed_reframing}"

Your move type is: ${MOVE_DESCRIPTIONS[aiMoveType]}

Rules:
- Stay genuinely engaged with the inquiry — this is a real thought-dance
- Be concise but substantive (2-4 sentences)
- Don't summarise what came before — move forward
- The move type should feel natural, not labelled or mechanical
- You are a genuine participant, not a helpful assistant`,
    messages: [
      ...conversationHistory,
      { role: 'user', content: `[${move_type.toUpperCase()}] ${content}` }
    ]
  }))

  const aiContent = aiResponse.content[0].type === 'text'
    ? aiResponse.content[0].text : ''

  await supabase.from('moves').insert({
    session_id, turn: turn + 1, role: 'ai', move_type: aiMoveType, content: aiContent
  })

  return NextResponse.json({ isComplete: false })
}
