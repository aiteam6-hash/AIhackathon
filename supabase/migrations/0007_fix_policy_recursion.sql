-- jobs and applications policies referenced each other, which Postgres rejects as infinite recursion.
-- Helper functions (security definer) break the cycle.
create or replace function public.applied_to_job(p_job_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.applications where job_id = p_job_id and applicant_id = auth.uid());
$$;

create or replace function public.job_is_open(p_job_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.jobs where id = p_job_id and status = 'open');
$$;

revoke execute on function public.applied_to_job(uuid), public.job_is_open(uuid) from public, anon;
grant execute on function public.applied_to_job(uuid), public.job_is_open(uuid) to authenticated;

drop policy jobs_select on public.jobs;
create policy jobs_select on public.jobs for select to authenticated
  using (recruiter_id = (select auth.uid()) or status = 'open' or public.applied_to_job(id));

drop policy applications_insert on public.applications;
create policy applications_insert on public.applications for insert to authenticated
  with check (applicant_id = (select auth.uid()) and stage = 'applied' and public.job_is_open(job_id));
