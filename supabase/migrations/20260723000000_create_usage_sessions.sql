-- SQL migration for creating application usage logs.
-- Authenticated users (such as the single admin/author of the app)
-- will be able to write and inspect their usage sessions.

create table if not exists public.usage_sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  duration_seconds double precision not null,
  cost_usd numeric(10, 6) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table public.usage_sessions enable row level security;

-- Policies
create policy "Users can insert their own usage sessions"
  on public.usage_sessions for insert
  with check (auth.uid() = user_id);

create policy "Users can read their own usage sessions"
  on public.usage_sessions for select
  using (auth.uid() = user_id);
