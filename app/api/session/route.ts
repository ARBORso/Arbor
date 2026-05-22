import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'

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
  const body = await req.json()
  console.log('Session API body:', body)

  const seed_problem = body.seed_problem
  const parent_node_id = body.parent_node_id || null
  const parent_move_id = body.parent_move_id || null
  const branch_type = body.branch_type || null

  const reframingResponse = await withRetry(() => anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1000,
    system: `You are a participant in Arbor — a game of collaborative thought. 
Your role in Phase 1 is to reframe the human's seed problem. 
NOT to answer it. NOT to solve it. 
Offer a completely different frame that opens new territory.
Be concise — one or two sentences. Make it surprising but true.`,
    messages: [{ role: 'user', content: seed_problem }]
  }))

  const seed_reframing = reframingResponse.content[0].type === 'text'
    ? reframingResponse.content[0].text
    : ''

  const { data, error } = await supabase
    .from('sessions')
    .insert({
      seed_problem,
      seed_reframing,
      parent_node_id,
      parent_move_id,
      status: 'exchange'
    })
    .select()
    .single()

  if (error) {
    console.error('Supabase insert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
