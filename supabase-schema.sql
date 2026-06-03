-- Run this in Supabase SQL Editor before using the production backend.

create extension if not exists "pgcrypto";

create table if not exists public.papers (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text not null,
  subject_key text not null,
  branch text,
  academic_year text,
  semester text,
  exam_session text,
  file_path text not null,
  file_url text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text not null,
  subject_key text not null,
  branch text,
  academic_year text,
  semester text,
  unit text,
  file_path text not null,
  file_url text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.results (
  id uuid primary key default gen_random_uuid(),
  student_name text not null,
  roll_no text not null,
  subject text not null,
  test_name text not null,
  marks text not null,
  created_at timestamptz not null default now()
);

create index if not exists papers_created_at_idx on public.papers (created_at desc);
create index if not exists papers_subject_key_idx on public.papers (subject_key);
create index if not exists notes_created_at_idx on public.notes (created_at desc);
create index if not exists notes_subject_key_idx on public.notes (subject_key);
create index if not exists results_lookup_idx on public.results (roll_no, subject, test_name);

alter table public.papers add column if not exists subject_key text;
alter table public.notes add column if not exists subject_key text;

update public.papers
set subject_key = lower(regexp_replace(regexp_replace(subject, '[^a-zA-Z0-9._-]+', '-', 'g'), '^-|-$', '', 'g'))
where subject_key is null or subject_key = '';

update public.notes
set subject_key = lower(regexp_replace(regexp_replace(subject, '[^a-zA-Z0-9._-]+', '-', 'g'), '^-|-$', '', 'g'))
where subject_key is null or subject_key = '';

alter table public.papers alter column subject_key set not null;
alter table public.notes alter column subject_key set not null;

alter table public.papers enable row level security;
alter table public.notes enable row level security;
alter table public.results enable row level security;

drop policy if exists "Public can read paper metadata" on public.papers;
create policy "Public can read paper metadata"
on public.papers
for select
using (true);

drop policy if exists "Public can read note metadata" on public.notes;
create policy "Public can read note metadata"
on public.notes
for select
using (true);

-- Admin writes use the service role key from the backend, which bypasses RLS.
-- Keep results private. Students should use /api/results instead of direct table access.
