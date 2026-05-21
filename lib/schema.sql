-- Run this in your Supabase SQL editor

create table sessions (
  id uuid default gen_random_uuid() primary key,
  seed_problem text not null,
  seed_reframing text,
  node_statement text,
  open_question text,
  parent_node_id uuid references sessions(id),
  status text default 'seeding' check (status in ('seeding', 'exchange', 'crystallization', 'complete')),
  created_at timestamp with time zone default now()
);

create table moves (
  id uuid default gen_random_uuid() primary key,
  session_id uuid references sessions(id) on delete cascade not null,
  turn integer not null,
  role text not null check (role in ('human', 'ai')),
  move_type text not null check (move_type in ('extend', 'challenge', 'pivot')),
  content text not null,
  created_at timestamp with time zone default now()
);

alter table sessions enable row level security;
alter table moves enable row level security;

create policy "Public read sessions" on sessions for select using (true);
create policy "Public insert sessions" on sessions for insert with check (true);
create policy "Public update sessions" on sessions for update using (true);

create policy "Public read moves" on moves for select using (true);
create policy "Public insert moves" on moves for insert with check (true);
