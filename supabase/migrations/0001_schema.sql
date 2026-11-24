-- Shortlist: tables, enums and indexes.
-- Company details live on recruiter_profiles; there is no companies table.

create type public.user_role         as enum ('applicant', 'recruiter');
create type public.job_status        as enum ('draft', 'open', 'paused', 'filled', 'closed');
create type public.work_mode         as enum ('remote', 'hybrid', 'onsite');
create type public.employment_type   as enum ('full_time', 'part_time', 'contract', 'internship');
create type public.job_category      as enum ('engineering', 'design', 'operations', 'sales', 'support', 'finance');
create type public.job_level         as enum ('entry', 'mid', 'senior', 'lead');
create type public.degree_level      as enum ('none', 'diploma', 'bachelors', 'masters', 'phd');
create type public.currency_code     as enum ('INR', 'USD', 'GBP', 'EUR');
create type public.app_stage         as enum ('applied', 'screening', 'shortlisted', 'interview', 'offer', 'hired', 'rejected', 'withdrawn');
create type public.criterion_kind    as enum ('skills', 'experience', 'education', 'stability', 'domain', 'communication', 'custom');
create type public.interview_mode    as enum ('video', 'phone', 'onsite');
create type public.interview_status  as enum ('scheduled', 'accepted', 'reschedule_requested');
create type public.skill_kind        as enum ('required', 'preferred');

/* ------------------------------ people ------------------------------ */

-- One row per signed-in user. `role` stays null until the user picks one after their first Google sign-in.
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        public.user_role,
  full_name   text not null default '',
  email       text not null default '',
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.recruiter_profiles (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  company_name  text not null,
  industry      text,
  company_size  text,
  city          text,
  website       text,
  about         text,
  logo_path     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.applicant_profiles (
  user_id               uuid primary key references public.profiles (id) on delete cascade,
  headline              text not null default '',
  location              text not null default '',
  experience_years      numeric(4,1) not null default 0 check (experience_years >= 0),
  summary               text not null default '',
  education_degree      public.degree_level not null default 'none',
  education_field       text not null default '',
  education_institution text not null default '',
  expected_salary       numeric not null default 0 check (expected_salary >= 0),
  salary_currency       public.currency_code not null default 'INR',
  notice_days           integer not null default 30 check (notice_days between 0 and 365),
  open_to_relocate      boolean not null default false,
  current_resume_id     uuid,
  pref_categories       public.job_category[] not null default '{}',
  pref_work_modes       public.work_mode[] not null default '{}',
  pref_min_salary       numeric not null default 0,
  notify_prefs          jsonb not null default '{"statusChanges": true, "newMatches": true, "weeklyDigest": false}',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table public.work_experiences (
  id            uuid primary key default gen_random_uuid(),
  applicant_id  uuid not null references public.applicant_profiles (user_id) on delete cascade,
  title         text not null,
  employer      text not null,
  start_year    smallint not null,
  end_year      smallint,            -- null means current role
  position      integer not null default 0
);

create table public.skills (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  category  public.job_category,
  aliases   text[] not null default '{}'
);
create unique index skills_name_key on public.skills (lower(name));

create table public.applicant_skills (
  applicant_id  uuid not null references public.applicant_profiles (user_id) on delete cascade,
  skill_id      uuid not null references public.skills (id) on delete restrict,
  primary key (applicant_id, skill_id)
);

create table public.resumes (
  id              uuid primary key default gen_random_uuid(),
  applicant_id    uuid not null references public.applicant_profiles (user_id) on delete cascade,
  file_name       text not null,
  storage_path    text not null,
  mime_type       text,
  size_bytes      bigint,
  extracted_text  text,
  parse_status    text not null default 'pending' check (parse_status in ('pending', 'parsed', 'failed', 'manual')),
  uploaded_at     timestamptz not null default now()
);

alter table public.applicant_profiles
  add constraint applicant_profiles_current_resume_fk
  foreign key (current_resume_id) references public.resumes (id) on delete set null;

/* ------------------------------- jobs ------------------------------- */

create table public.jobs (
  id               uuid primary key default gen_random_uuid(),
  recruiter_id     uuid not null references public.recruiter_profiles (user_id) on delete cascade,
  title            text not null,
  category         public.job_category not null,
  department       text not null default '',
  location         text not null default '',
  work_mode        public.work_mode not null default 'hybrid',
  employment_type  public.employment_type not null default 'full_time',
  level            public.job_level not null default 'mid',
  salary_min       numeric not null default 0,
  salary_max       numeric not null default 0,
  currency         public.currency_code not null default 'INR',
  description      text not null default '',
  responsibilities text[] not null default '{}',
  openings         integer not null default 1 check (openings >= 1),
  allow_ineligible boolean not null default false,
  status           public.job_status not null default 'draft',
  posted_at        timestamptz,
  -- hard requirements, stored as columns so "eligible for you" is plain SQL
  min_experience   numeric(4,1) not null default 0,
  degree_required  public.degree_level not null default 'none',
  max_notice_days  integer not null default 90,
  allowed_locations text[] not null default '{}',
  search           tsvector generated always as (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))) stored,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (salary_max >= salary_min)
);
create index jobs_status_category_idx on public.jobs (status, category);
create index jobs_recruiter_idx on public.jobs (recruiter_id);
create index jobs_search_idx on public.jobs using gin (search);

create table public.job_skills (
  job_id    uuid not null references public.jobs (id) on delete cascade,
  skill_id  uuid not null references public.skills (id) on delete restrict,
  kind      public.skill_kind not null,
  primary key (job_id, skill_id)
);
create index job_skills_skill_idx on public.job_skills (skill_id);

create table public.job_questions (
  id        uuid primary key default gen_random_uuid(),
  job_id    uuid not null references public.jobs (id) on delete cascade,
  text      text not null,
  position  integer not null default 0
);

create table public.job_criteria (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs (id) on delete cascade,
  label        text not null,
  kind         public.criterion_kind not null,
  weight       numeric not null default 0 check (weight >= 0),
  description  text not null default '',
  position     integer not null default 0
);

create table public.criteria_templates (
  id            uuid primary key default gen_random_uuid(),
  recruiter_id  uuid not null references public.recruiter_profiles (user_id) on delete cascade,
  name          text not null,
  created_at    timestamptz not null default now()
);

create table public.criteria_template_items (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references public.criteria_templates (id) on delete cascade,
  label        text not null,
  kind         public.criterion_kind not null,
  weight       numeric not null default 0 check (weight >= 0),
  description  text not null default '',
  position     integer not null default 0
);

/* --------------------------- applications --------------------------- */

create table public.applications (
  id                 uuid primary key default gen_random_uuid(),
  job_id             uuid not null references public.jobs (id) on delete cascade,
  applicant_id       uuid not null references public.applicant_profiles (user_id) on delete cascade,
  resume_id          uuid references public.resumes (id) on delete set null,
  stage              public.app_stage not null default 'applied',
  cover_note         text not null default '',
  expected_salary    numeric not null default 0,
  notice_days        integer not null default 30,
  applied_anyway     boolean not null default false,
  eligible           boolean not null default true,
  eligibility_checks jsonb not null default '[]',   -- snapshot at apply time
  final_score        smallint check (final_score between 0 and 100),
  ai_summary         text,
  rejected_at_stage  public.app_stage,
  applied_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
-- one live application per person per job; withdrawn ones do not block re-applying
create unique index applications_one_live_idx on public.applications (job_id, applicant_id) where stage <> 'withdrawn';
create index applications_job_stage_idx on public.applications (job_id, stage);
create index applications_applicant_idx on public.applications (applicant_id);

create table public.application_answers (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.applications (id) on delete cascade,
  question_id     uuid references public.job_questions (id) on delete set null,
  question_text   text not null,   -- snapshot, in case the question is edited later
  answer          text not null default ''
);
create index application_answers_app_idx on public.application_answers (application_id);

create table public.stage_events (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.applications (id) on delete cascade,
  from_stage      public.app_stage,
  to_stage        public.app_stage not null,
  actor_type      text not null check (actor_type in ('applicant', 'recruiter', 'system')),
  actor_id        uuid,
  note            text,
  at              timestamptz not null default now()
);
create index stage_events_app_idx on public.stage_events (application_id, at);

create table public.application_notes (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.applications (id) on delete cascade,
  author_id       uuid not null references public.profiles (id) on delete cascade,
  text            text not null,
  at              timestamptz not null default now()
);

create table public.interviews (
  id                uuid primary key default gen_random_uuid(),
  application_id    uuid not null references public.applications (id) on delete cascade,
  scheduled_at      timestamptz not null,
  mode              public.interview_mode not null default 'video',
  location_or_link  text not null,
  panel             text[] not null default '{}',
  status            public.interview_status not null default 'scheduled',
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now()
);
create index interviews_app_idx on public.interviews (application_id, scheduled_at);

create table public.application_overrides (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.applications (id) on delete cascade,
  type            text not null check (type in ('score', 'decision')),
  target          text not null,
  from_value      text not null,
  to_value        text not null,
  comment         text not null,
  by_user         uuid references public.profiles (id) on delete set null,
  at              timestamptz not null default now()
);

create table public.rejection_feedback (
  application_id  uuid primary key references public.applications (id) on delete cascade,
  stage           public.app_stage not null,
  message         text not null,
  reasons         text[] not null default '{}',
  improvements    text[] not null default '{}',
  edited          boolean not null default false,
  model           text,
  generated_at    timestamptz not null default now(),
  sent_at         timestamptz
);

/* ------------------------------ scoring ------------------------------ */

create table public.scoring_runs (
  id                 uuid primary key default gen_random_uuid(),
  job_id             uuid not null references public.jobs (id) on delete cascade,
  started_by         uuid references public.profiles (id) on delete set null,
  criteria_snapshot  jsonb not null,
  model              text not null default 'rules-v1',
  prompt_version     text,
  created_at         timestamptz not null default now()
);

create table public.scoring_results (
  id              uuid primary key default gen_random_uuid(),
  run_id          uuid not null references public.scoring_runs (id) on delete cascade,
  application_id  uuid not null references public.applications (id) on delete cascade,
  final_score     smallint not null check (final_score between 0 and 100),
  is_current      boolean not null default true,
  created_at      timestamptz not null default now()
);
create unique index scoring_results_current_idx on public.scoring_results (application_id) where is_current;

create table public.criterion_scores (
  id                uuid primary key default gen_random_uuid(),
  result_id         uuid not null references public.scoring_results (id) on delete cascade,
  label             text not null,
  weight            numeric not null,
  ai_score          smallint not null check (ai_score between 0 and 100),
  reasoning         text not null default '',
  override_score    smallint check (override_score between 0 and 100),
  override_comment  text,
  overridden_by     uuid references public.profiles (id) on delete set null,
  overridden_at     timestamptz,
  check (override_score is null or length(coalesce(override_comment, '')) > 0)
);
create index criterion_scores_result_idx on public.criterion_scores (result_id);

/* ------------------------ notifications and audit ------------------------ */

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  title       text not null,
  body        text not null default '',
  href        text not null default '/',
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, read_at);

create table public.ai_generations (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('parse_resume', 'score', 'summary', 'feedback', 'criteria', 'job_description')),
  model           text not null,
  prompt_version  text,
  job_id          uuid references public.jobs (id) on delete set null,
  application_id  uuid references public.applications (id) on delete set null,
  input_tokens    integer,
  output_tokens   integer,
  latency_ms      integer,
  status          text not null default 'ok' check (status in ('ok', 'error')),
  error           text,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);

/* -------------------------------- views -------------------------------- */

-- Applicants per stage per job. security_invoker makes it respect the caller's row-level security.
create view public.job_stage_counts with (security_invoker = true) as
  select job_id, stage, count(*)::int as total
  from public.applications
  group by job_id, stage;
