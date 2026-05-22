import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type MoveType = 'extend' | 'challenge' | 'pivot'

export type Move = {
  id: string
  session_id: string
  turn: number
  role: 'human' | 'ai'
  move_type: MoveType
  content: string
  created_at: string
}

export type Session = {
  id: string
  seed_problem: string
  seed_reframing: string
  node_statement: string | null
  open_question: string | null
  parent_node_id: string | null
  parent_move_id: string | null
  status: 'seeding' | 'exchange' | 'crystallization' | 'complete'
  moves: Move[]
  created_at: string
}
