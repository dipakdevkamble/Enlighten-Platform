-- Run this in Supabase SQL Editor before using the production backend.
-- This schema keeps PDFs private, serves them through backend signed URLs,
-- and prevents duplicate result records for the same student/roll/subject/test.
--
-- If this script stops on existing text result marks, run this review query:
-- select id, student_name, roll_no, subject, test_name, marks
-- from public.results
-- where public.parse_marks_text(marks) is null
--   and (marks_obtained is null or marks_total is null);
--
-- Then fix each row, for example:
-- update public.results
-- set marks_obtained = 18, marks_total = 20
-- where id = 'paste-row-id-here';
--
-- After the review query returns zero rows, rerun this full file.
-- Existing result tables need the ownership column before the review query:
-- alter table public.results add column if not exists student_email text;
--
-- Then populate every legacy result before students can see it:
-- select id, student_name, roll_no, subject, test_name
-- from public.results
-- where student_email is null or btrim(student_email) = '';
--
-- Update every returned row with the student's confirmed login email, then rerun
-- this file. The migration intentionally stops rather than leaving inaccessible
-- or ambiguously owned result records in production.

create extension if not exists "pgcrypto";

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('papers', 'papers', false, 26214400, array['application/pdf'])
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

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
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.results (
  id uuid primary key default gen_random_uuid(),
  student_name text not null,
  student_email text not null,
  roll_no text not null,
  roll_key text not null,
  subject text not null,
  subject_key text not null,
  test_name text not null,
  test_key text not null,
  marks_obtained numeric(6,2) not null,
  marks_total numeric(6,2) not null,
  created_by uuid references auth.users(id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.slug_key(value text)
returns text
language sql
immutable
as $$
  select lower(
    regexp_replace(
      regexp_replace(btrim(coalesce(value, '')), '[^a-zA-Z0-9._-]+', '-', 'g'),
      '(^-+|-+$)',
      '',
      'g'
    )
  );
$$;

create or replace function public.lookup_key(value text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(btrim(coalesce(value, '')), '[[:space:]]+', ' ', 'g'));
$$;

create or replace function public.parse_marks_text(value text)
returns numeric[]
language plpgsql
immutable
as $$
declare
  clean_value text := lower(btrim(coalesce(value, '')));
  parts text[];
begin
  clean_value := regexp_replace(clean_value, ',', '', 'g');
  clean_value := regexp_replace(clean_value, '[[:space:]]+', ' ', 'g');

  parts := regexp_match(
    clean_value,
    '^([0-9]+(?:\.[0-9]+)?)\s*(?:marks?)?\s*(?:/|of|out of)\s*([0-9]+(?:\.[0-9]+)?)\s*(?:marks?)?$',
    'i'
  );
  if parts is not null then
    return array[parts[1]::numeric, parts[2]::numeric];
  end if;

  parts := regexp_match(clean_value, '^([0-9]+(?:\.[0-9]+)?)\s*%$', 'i');
  if parts is not null then
    return array[parts[1]::numeric, 100::numeric];
  end if;

  return null;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.papers add column if not exists subject_key text;
alter table public.papers add column if not exists uploaded_by uuid references auth.users(id) on delete set null;
alter table public.papers add column if not exists uploaded_by_email text;
alter table public.papers add column if not exists updated_at timestamptz not null default now();
alter table public.papers drop column if exists file_url;

alter table public.notes add column if not exists subject_key text;
alter table public.notes add column if not exists uploaded_by uuid references auth.users(id) on delete set null;
alter table public.notes add column if not exists uploaded_by_email text;
alter table public.notes add column if not exists updated_at timestamptz not null default now();
alter table public.notes drop column if exists file_url;

alter table public.results add column if not exists roll_key text;
alter table public.results add column if not exists student_email text;
alter table public.results add column if not exists subject_key text;
alter table public.results add column if not exists test_key text;
alter table public.results add column if not exists marks_obtained numeric(6,2);
alter table public.results add column if not exists marks_total numeric(6,2);
alter table public.results add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.results add column if not exists created_by_email text;
alter table public.results add column if not exists updated_at timestamptz not null default now();

update public.papers
set subject_key = public.slug_key(subject)
where subject_key is null or subject_key = '';

update public.notes
set subject_key = public.slug_key(subject)
where subject_key is null or subject_key = '';

update public.results
set
  roll_key = public.lookup_key(roll_no),
  subject_key = public.slug_key(subject),
  test_key = public.slug_key(test_name)
where roll_key is null
   or roll_key = ''
   or subject_key is null
   or subject_key = ''
   or test_key is null
   or test_key = '';

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'results'
      and column_name = 'marks'
  ) then
    execute $migrate_marks$
      with parsed_marks as (
        select
          id,
          public.parse_marks_text(marks) as parts
        from public.results
        where (marks_obtained is null or marks_total is null)
          and marks is not null
      )
      update public.results r
      set
        marks_obtained = (parsed_marks.parts)[1]::numeric,
        marks_total = (parsed_marks.parts)[2]::numeric
      from parsed_marks
      where r.id = parsed_marks.id
        and parsed_marks.parts is not null
    $migrate_marks$;

    if exists (
      select 1
      from public.results
      where marks_obtained is null
         or marks_total is null
    ) then
      raise exception 'Some existing result rows could not be migrated from text marks. Run the review query in supabase-schema.sql, fix those rows, then rerun this schema.';
    end if;

    execute 'alter table public.results drop column marks';
  end if;
end;
$$;

alter table public.papers alter column subject_key set not null;
alter table public.notes alter column subject_key set not null;
alter table public.results alter column roll_key set not null;
alter table public.results alter column subject_key set not null;
alter table public.results alter column test_key set not null;

update public.results
set student_email = lower(btrim(student_email))
where student_email is not null;

do $$
begin
  if exists (
    select 1
    from public.results
    where student_email is null
       or student_email = ''
       or student_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then
    raise exception 'Some existing result rows do not have a valid student_email. Run the review query in supabase-schema.sql, populate each confirmed login email, then rerun this schema.';
  end if;
end;
$$;

alter table public.results alter column student_email set not null;

alter table public.results drop constraint if exists results_student_email_format_check;
alter table public.results add constraint results_student_email_format_check
check (
  student_email = lower(btrim(student_email))
  and student_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
);

alter table public.results drop constraint if exists results_marks_range_check;
alter table public.results add constraint results_marks_range_check
check (
  marks_total > 0
  and marks_obtained >= 0
  and marks_obtained <= marks_total
);

alter table public.results alter column marks_obtained set not null;
alter table public.results alter column marks_total set not null;

create index if not exists papers_created_at_idx on public.papers (created_at desc);
create index if not exists papers_subject_key_idx on public.papers (subject_key);
create index if not exists notes_created_at_idx on public.notes (created_at desc);
create index if not exists notes_subject_key_idx on public.notes (subject_key);
create index if not exists results_student_email_lookup_idx on public.results (student_email, roll_key, subject_key, test_key);
create index if not exists results_lookup_idx on public.results (roll_key, subject_key, test_key);
create index if not exists results_created_at_idx on public.results (created_at desc);

do $$
begin
  if exists (
    select 1
    from public.results
    group by student_email, roll_key, subject_key, test_key
    having count(*) > 1
  ) then
    raise exception 'Duplicate result rows exist for the same student_email, roll_no, subject, and test_name. Resolve duplicates before adding the production unique index.';
  end if;
end;
$$;

drop index if exists public.results_unique_roll_subject_test_idx;
create unique index if not exists results_unique_student_roll_subject_test_idx
on public.results (student_email, roll_key, subject_key, test_key);

drop trigger if exists papers_set_updated_at on public.papers;
create trigger papers_set_updated_at
before update on public.papers
for each row execute function public.set_updated_at();

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at
before update on public.notes
for each row execute function public.set_updated_at();

drop trigger if exists results_set_updated_at on public.results;
create trigger results_set_updated_at
before update on public.results
for each row execute function public.set_updated_at();

alter table public.papers enable row level security;
alter table public.notes enable row level security;
alter table public.results enable row level security;

drop policy if exists "Public can read paper metadata" on public.papers;
drop policy if exists "Public can read note metadata" on public.notes;
drop policy if exists "Authenticated users can read paper metadata" on public.papers;
drop policy if exists "Authenticated users can read note metadata" on public.notes;

-- No client-side read policies are created for papers, notes, or results.
-- The Express backend reads with the service role key after app-level auth checks.
-- The private Storage bucket returns PDFs only through short-lived signed URLs.
