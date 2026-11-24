-- Shortlist: row-level security and the private resumes bucket.
-- Signed-out visitors get nothing. `(select auth.uid())` is used so Postgres evaluates it once per query.

alter table public.profiles                enable row level security;
alter table public.recruiter_profiles      enable row level security;
alter table public.applicant_profiles      enable row level security;
alter table public.work_experiences        enable row level security;
alter table public.skills                  enable row level security;
alter table public.applicant_skills        enable row level security;
alter table public.resumes                 enable row level security;
alter table public.jobs                    enable row level security;
alter table public.job_skills              enable row level security;
alter table public.job_questions           enable row level security;
alter table public.job_criteria            enable row level security;
alter table public.criteria_templates      enable row level security;
alter table public.criteria_template_items enable row level security;
alter table public.applications            enable row level security;
alter table public.application_answers     enable row level security;
alter table public.stage_events            enable row level security;
alter table public.application_notes       enable row level security;
alter table public.interviews              enable row level security;
alter table public.application_overrides   enable row level security;
alter table public.rejection_feedback      enable row level security;
alter table public.scoring_runs            enable row level security;
alter table public.scoring_results         enable row level security;
alter table public.criterion_scores        enable row level security;
alter table public.notifications           enable row level security;
alter table public.ai_generations          enable row level security;

/* ------------------------------- people ------------------------------- */
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.recruiter_sees_applicant(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Company details are shown to applicants on job pages, so any signed-in user can read them.
create policy recruiter_profiles_select on public.recruiter_profiles for select to authenticated using (true);
create policy recruiter_profiles_insert on public.recruiter_profiles for insert to authenticated with check (user_id = (select auth.uid()));
create policy recruiter_profiles_update on public.recruiter_profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy applicant_profiles_select on public.applicant_profiles for select to authenticated
  using (user_id = (select auth.uid()) or public.recruiter_sees_applicant(user_id));
create policy applicant_profiles_insert on public.applicant_profiles for insert to authenticated with check (user_id = (select auth.uid()));
create policy applicant_profiles_update on public.applicant_profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy applicant_profiles_delete on public.applicant_profiles for delete to authenticated using (user_id = (select auth.uid()));

create policy work_experiences_select on public.work_experiences for select to authenticated
  using (applicant_id = (select auth.uid()) or public.recruiter_sees_applicant(applicant_id));
create policy work_experiences_write on public.work_experiences for all to authenticated
  using (applicant_id = (select auth.uid())) with check (applicant_id = (select auth.uid()));

create policy applicant_skills_select on public.applicant_skills for select to authenticated
  using (applicant_id = (select auth.uid()) or public.recruiter_sees_applicant(applicant_id));
create policy applicant_skills_write on public.applicant_skills for all to authenticated
  using (applicant_id = (select auth.uid())) with check (applicant_id = (select auth.uid()));

create policy skills_select on public.skills for select to authenticated using (true);
create policy skills_insert on public.skills for insert to authenticated with check (true);

create policy resumes_select on public.resumes for select to authenticated
  using (applicant_id = (select auth.uid()) or public.recruiter_sees_applicant(applicant_id));
create policy resumes_write on public.resumes for all to authenticated
  using (applicant_id = (select auth.uid())) with check (applicant_id = (select auth.uid()));

/* -------------------------------- jobs -------------------------------- */
-- Applicants see open jobs, plus any job they applied to even after it closes.
create policy jobs_select on public.jobs for select to authenticated
  using (
    recruiter_id = (select auth.uid())
    or status = 'open'
    or exists (select 1 from public.applications a where a.job_id = jobs.id and a.applicant_id = (select auth.uid()))
  );
create policy jobs_insert on public.jobs for insert to authenticated with check (recruiter_id = (select auth.uid()));
create policy jobs_update on public.jobs for update to authenticated
  using (recruiter_id = (select auth.uid())) with check (recruiter_id = (select auth.uid()));
create policy jobs_delete on public.jobs for delete to authenticated using (recruiter_id = (select auth.uid()));

-- Skills and questions follow the job's visibility (the subquery runs under the caller's own policies).
create policy job_skills_select on public.job_skills for select to authenticated
  using (exists (select 1 from public.jobs j where j.id = job_id));
create policy job_skills_write on public.job_skills for all to authenticated
  using (public.owns_job(job_id)) with check (public.owns_job(job_id));

create policy job_questions_select on public.job_questions for select to authenticated
  using (exists (select 1 from public.jobs j where j.id = job_id));
create policy job_questions_write on public.job_questions for all to authenticated
  using (public.owns_job(job_id)) with check (public.owns_job(job_id));

-- Scoring criteria are private to the recruiter.
create policy job_criteria_all on public.job_criteria for all to authenticated
  using (public.owns_job(job_id)) with check (public.owns_job(job_id));

create policy criteria_templates_all on public.criteria_templates for all to authenticated
  using (recruiter_id = (select auth.uid())) with check (recruiter_id = (select auth.uid()));
create policy criteria_template_items_all on public.criteria_template_items for all to authenticated
  using (exists (select 1 from public.criteria_templates t where t.id = template_id and t.recruiter_id = (select auth.uid())))
  with check (exists (select 1 from public.criteria_templates t where t.id = template_id and t.recruiter_id = (select auth.uid())));

/* ---------------------------- applications ---------------------------- */
create policy applications_select on public.applications for select to authenticated
  using (applicant_id = (select auth.uid()) or public.owns_job(job_id));
create policy applications_insert on public.applications for insert to authenticated
  with check (
    applicant_id = (select auth.uid())
    and stage = 'applied'
    and exists (select 1 from public.jobs j where j.id = job_id and j.status = 'open')
  );
-- Recruiters move stages. Applicants withdraw through withdraw_application() only.
create policy applications_update on public.applications for update to authenticated
  using (public.owns_job(job_id)) with check (public.owns_job(job_id));

create policy application_answers_select on public.application_answers for select to authenticated
  using (public.is_my_application(application_id) or public.owns_application_job(application_id));
create policy application_answers_insert on public.application_answers for insert to authenticated
  with check (public.is_my_application(application_id));

create policy stage_events_select on public.stage_events for select to authenticated
  using (public.is_my_application(application_id) or public.owns_application_job(application_id));

create policy application_notes_all on public.application_notes for all to authenticated
  using (public.owns_application_job(application_id))
  with check (public.owns_application_job(application_id) and author_id = (select auth.uid()));

create policy interviews_select on public.interviews for select to authenticated
  using (public.is_my_application(application_id) or public.owns_application_job(application_id));
create policy interviews_write on public.interviews for all to authenticated
  using (public.owns_application_job(application_id)) with check (public.owns_application_job(application_id));

create policy application_overrides_select on public.application_overrides for select to authenticated
  using (public.owns_application_job(application_id));
create policy application_overrides_insert on public.application_overrides for insert to authenticated
  with check (public.owns_application_job(application_id) and by_user = (select auth.uid()));

-- Applicants only see feedback once it has been sent.
create policy rejection_feedback_select on public.rejection_feedback for select to authenticated
  using ((public.is_my_application(application_id) and sent_at is not null) or public.owns_application_job(application_id));
create policy rejection_feedback_write on public.rejection_feedback for all to authenticated
  using (public.owns_application_job(application_id)) with check (public.owns_application_job(application_id));

/* ------------------------------- scoring ------------------------------- */
create policy scoring_runs_all on public.scoring_runs for all to authenticated
  using (public.owns_job(job_id)) with check (public.owns_job(job_id) and started_by = (select auth.uid()));
create policy scoring_results_all on public.scoring_results for all to authenticated
  using (public.owns_application_job(application_id)) with check (public.owns_application_job(application_id));
create policy criterion_scores_all on public.criterion_scores for all to authenticated
  using (exists (select 1 from public.scoring_results r where r.id = result_id and public.owns_application_job(r.application_id)))
  with check (exists (select 1 from public.scoring_results r where r.id = result_id and public.owns_application_job(r.application_id)));

/* ------------------------- notifications and audit ------------------------- */
create policy notifications_select on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Written only by server code with the service role (which bypasses RLS); users may read their own.
create policy ai_generations_select on public.ai_generations for select to authenticated using (created_by = (select auth.uid()));

/* ------------------------------ storage ------------------------------ */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resumes', 'resumes', false, 5242880,
        array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'])
on conflict (id) do nothing;

-- Files live at {user_id}/{file}. Only the owner touches them; recruiters get signed URLs from server code.
create policy resumes_bucket_select on storage.objects for select to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy resumes_bucket_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy resumes_bucket_update on storage.objects for update to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy resumes_bucket_delete on storage.objects for delete to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
