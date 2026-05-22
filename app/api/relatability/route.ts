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
  // Fetch all complete sessions
  const { data: sessions } = await supabase
    .from('sessions')
    .select('*')
    .eq('status', 'complete')
    .order('created_at', { ascending: true })

  if (!sessions || sessions.length < 2) {
    return NextResponse.json({ message: 'Not enough sessions to compare' })
  }

  const results = []

  for (let i = 0; i < sessions.length; i++) {
    for (let j = i + 1; j < sessions.length; j++) {
      const a = sessions[i]
      const b = sessions[j]

      // Check if already computed
      const { data: existing } = await supabase
        .from('relatability')
        .select('*')
        .eq('session_a', a.id)
        .eq('session_b', b.id)
        .single()

      if (existing) {
        results.push(existing)
        continue
      }

      // Compute score
      const response = await withRetry(() => anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 500,
        system: `You compare two Arbor sessions and score their relatability.
        
Relatability is based on:
1. How close the core ideas are semantically
2. Whether one session's open question resonates with the other's seed
3. Whether the node statements share underlying concepts
4. Whether the thinking styles (move patterns) are similar

Return ONLY a JSON object in this format:
{"score": 7.5, "reasoning": "One sentence explaining the connection"}

Score is 0-10. 0 = completely unrelated. 10 = essentially the same inquiry from different angles.`,
        messages: [{
          role: 'user',
          content: `SESSION A:
Seed: "${a.seed_problem}"
Node: "${a.node_statement}"
Open question: "${a.open_question}"

SESSION B:
Seed: "${b.seed_problem}"
Node: "${b.node_statement}"
Open question: "${b.open_question}"`
        }]
      }))

      const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
      const clean = text.replace(/```json|```/g, '').trim()
      const { score, reasoning } = JSON.parse(clean)

      const { data: inserted } = await supabase
        .from('relatability')
        .insert({ session_a: a.id, session_b: b.id, score, reasoning })
        .select()
        .single()

      results.push(inserted)
    }
  }

  return NextResponse.json({ results })
}

export async function GET() {
  const { data } = await supabase
    .from('relatability')
    .select('*')
  return NextResponse.json(data || [])
}
