import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase, Move } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { session_id, node_statement } = await req.json()

  const { data: session } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', session_id)
    .single()

  const { data: moves } = await supabase
    .from('moves')
    .select('*')
    .eq('session_id', session_id)
    .order('turn', { ascending: true })

  const movesSummary = (moves || []).map((m: Move) =>
    `[${m.role.toUpperCase()} - ${m.move_type.toUpperCase()}] ${m.content}`
  ).join('\n\n')

  const questionResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: `You are completing a session of Arbor — a game of collaborative thought.

The human has distilled the session into a Node statement. 
Your task: add the ONE question this Node leaves open.

This question is the most important output of the session.
It must:
- Emerge genuinely from the conversation — not be generic
- Open territory the conversation didn't enter
- Be specific enough to be a real seed for the next session
- Feel like an invitation, not an interrogation

Return only the question. No preamble.`,
    messages: [{
      role: 'user',
      content: `Seed problem: "${session?.seed_problem}"

Full exchange:
${movesSummary}

Human's Node statement: "${node_statement}"

What is the one question this Node leaves open?`
    }]
  })

  const open_question = questionResponse.content[0].type === 'text'
    ? questionResponse.content[0].text
    : ''

  const { data, error } = await supabase
    .from('sessions')
    .update({
      node_statement,
      open_question,
      status: 'complete'
    })
    .eq('id', session_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
