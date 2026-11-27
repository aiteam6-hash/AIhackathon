-- AI interviews: a recruiter approves questions for a shortlisted candidate, the applicant answers them by voice or
-- text, and the recruiter gets a summary. Only transcripts are stored; audio never leaves the applicant's device.
create type public.ai_interview_status as enum ('draft', 'approved', 'in_progress', 'completed', 'cancelled');

create table public.ai_interviews (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  status         public.ai_interview_status not null default 'draft',
  questions      jsonb not null default '[]',   -- [{ "id": "q1", "text": "..." }]
  created_by     uuid references public.profiles (id) on delete set null,
  approved_by    uuid references public.profiles (id) on delete set null,
  approved_at    timestamptz,
  expires_at     timestamptz,
  consent_at     timestamptz,
  started_at     timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz not null default now()
);
create unique index ai_interviews_one_open_idx on public.ai_interviews (application_id) where status in ('draft', 'approved', 'in_progress');
create index ai_interviews_app_idx on public.ai_interviews (application_id);
create index ai_interviews_created_by_idx on public.ai_interviews (created_by);
create index ai_interviews_approved_by_idx on public.ai_interviews (approved_by);

create table public.ai_interview_answers (
  id               uuid primary key default gen_random_uuid(),
  interview_id     uuid not null references public.ai_interviews (id) on delete cascade,
  question_id      text not null,
  question_text    text not null,
  answer           text not null,
  input_mode       text not null check (input_mode in ('voice', 'typed')),
  duration_seconds integer,
  created_at       timestamptz not null default now(),
  unique (interview_id, question_id)
);

-- The summary is for the recruiter only, so it lives in its own table.
create table public.ai_interview_summaries (
  id             uuid primary key default gen_random_uuid(),
  interview_id   uuid not null unique references public.ai_interviews (id) on delete cascade,
  overview       text not null,
  strengths      text[] not null default '{}',
  concerns       text[] not null default '{}',
  per_answer     jsonb not null default '[]',
  recommendation text not null,
  model          text not null,
  created_at     timestamptz not null default now()
);

create or replace function public.owns_interview_job(p_interview_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ai_interviews i
    join public.applications a on a.id = i.application_id
    join public.jobs j on j.id = a.job_id
    where i.id = p_interview_id and j.recruiter_id = auth.uid());
$$;

create or replace function public.is_my_interview(p_interview_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ai_interviews i
    join public.applications a on a.id = i.application_id
    where i.id = p_interview_id and a.applicant_id = auth.uid());
$$;

revoke execute on function public.owns_interview_job(uuid), public.is_my_interview(uuid) from public, anon;
grant execute on function public.owns_interview_job(uuid), public.is_my_interview(uuid) to authenticated;

alter table public.ai_interviews enable row level security;
alter table public.ai_interview_answers enable row level security;
alter table public.ai_interview_summaries enable row level security;

create policy ai_interviews_select on public.ai_interviews for select to authenticated
  using (public.owns_application_job(application_id)
         or (public.is_my_application(application_id) and status in ('approved', 'in_progress', 'completed')));
create policy ai_interviews_insert on public.ai_interviews for insert to authenticated
  with check (public.owns_application_job(application_id) and status = 'draft' and created_by = (select auth.uid()));
create policy ai_interviews_update on public.ai_interviews for update to authenticated
  using (public.owns_application_job(application_id)) with check (public.owns_application_job(application_id));

create policy ai_interview_answers_select on public.ai_interview_answers for select to authenticated
  using (public.owns_interview_job(interview_id) or public.is_my_interview(interview_id));

create policy ai_interview_summaries_all on public.ai_interview_summaries for all to authenticated
  using (public.owns_interview_job(interview_id)) with check (public.owns_interview_job(interview_id));

-- guard_ai_interview, start_ai_interview and submit_ai_interview are defined in 0011 (final versions).
