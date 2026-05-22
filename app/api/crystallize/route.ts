import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase, Move } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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
  const { session_id } = await req.json()

  const { data: session } = await supabase
    .from('sessions').select('*').eq('id', session_id).single()

  const { data: moves } = await supabase
    .from('moves').select('*').eq('session_id', session_id).order('turn', { ascending: true })

  const movesSummary = (moves || []).map((m: Move) =>
    `[${m.role.toUpperCase()} - ${m.move_type.toUpperCase()}] ${m.content}`
  ).join('\n\n')

  const response = await withRetry(() => anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1000,
    system: `You are completing a session of Arbor — a game of collaborative thought.
Your task: read the full exchange and crystallise it into two things.

1. NODE STATEMENT — one sentence that captures where the thinking arrived. Not a summary. The distilled insight.
2. OPEN QUESTION — one question this Node leaves open. The most important output. It must open new territory, be specific, and feel like an invitation for the next session.

Respond in this exact JSON format:
{"node_statement": "...", "open_question": "..."}

No preamble. No explanation. Only the JSON.`,
    messages: [{
      role: 'user',
      content: `Seed problem: "${session?.seed_problem}"
Reframing: "${session?.seed_reframing}"

Full exchange:
${movesSummary}`
    }]
  }))

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const clean = text.replace(/```json|```/g, '').trim()
  const { node_statement, open_question } = JSON.parse(clean)

  const { data, error } = await supabase
    .from('sessions')
    .update({ node_statement, open_question, status: 'complete' })
    .eq('id', session_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
