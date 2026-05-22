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
  // Fetch all moves with their session context
  const { data: moves } = await supabase
    .from('moves')
    .select('*, sessions(*)')
    .order('created_at', { ascending: true })

  if (!moves || moves.length < 2) {
    return NextResponse.json({ message: 'Not enough moves to compare' })
  }

  // Only compare moves from different sessions
  const results = []
  let computed = 0

  for (let i = 0; i < moves.length; i++) {
    for (let j = i + 1; j < moves.length; j++) {
      const a = moves[i]
      const b = moves[j]

      // Skip moves from same session
      if (a.session_id === b.session_id) continue

      // Check if already computed
      const { data: existing } = await supabase
        .from('move_relatability')
        .select('*')
        .eq('move_a', a.id)
        .eq('move_b', b.id)
        .single()

      if (existing) {
        results.push(existing)
        continue
      }

      const response = await withRetry(() => anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 300,
        system: `You compare two individual moves from different thought sessions and score their relatability.

A move is a single turn in a collaborative thinking game. Types are:
→ Extend: builds forward
↔ Challenge: finds tension
↑ Pivot: unexpected leap

Score based on:
1. Semantic similarity of the thoughts themselves
2. Whether they're making the same kind of cognitive move
3. The surprise value — how unexpected is this connection?

Return ONLY JSON:
{"score": 7.5, "reasoning": "One sentence explaining the resonance"}

Score 0-10. Focus on the beauty of unexpected connections between unrelated sessions.`,
        messages: [{
          role: 'user',
          content: `MOVE A:
Type: ${a.move_type} | Role: ${a.role}
Session seed: "${a.sessions?.seed_problem}"
Content: "${a.content}"

MOVE B:
Type: ${b.move_type} | Role: ${b.role}
Session seed: "${b.sessions?.seed_problem}"
Content: "${b.content}"`
        }]
      }))

      const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
      const clean = text.replace(/```json|```/g, '').trim()

      try {
        const { score, reasoning } = JSON.parse(clean)
        const { data: inserted } = await supabase
          .from('move_relatability')
          .insert({ move_a: a.id, move_b: b.id, score, reasoning })
          .select()
          .single()
        results.push(inserted)
        computed++
      } catch (e) {
        console.error('Parse error for moves', a.id, b.id)
      }
    }
  }

  return NextResponse.json({ results, computed })
}

export async function GET() {
  const { data } = await supabase.from('move_relatability').select('*')
  return NextResponse.json(data || [])
}
