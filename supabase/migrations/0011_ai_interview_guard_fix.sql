-- Rules and applicant actions for AI interviews.
-- Recruiters may only move an interview draft -> approved, or draft/approved -> cancelled, and only while the
-- candidate is shortlisted or further. Approving stamps who approved it, opens a 7 day window and notifies the
-- applicant. Applicants never write the tables directly: they call start_ai_interview and submit_ai_interview, which
-- set a transaction-local marker so the guard can tell their changes from a recruiter's.
create or replace function public.guard_ai_interview() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  app public.applications;
  job public.jobs;
  from_function boolean := coalesce(current_setting('app.ai_interview_fn', true), '') = '1';
begin
  select * into app from public.applications where id = new.application_id;
  select * into job from public.jobs where id = app.job_id;

  if tg_op = 'INSERT' then
    if app.stage not in ('shortlisted', 'interview', 'offer') then
      raise exception 'AI interviews are only for shortlisted candidates';
    end if;
    return new;
  end if;

  if not from_function then
    if new.status is distinct from old.status
       and not ((old.status = 'draft' and new.status in ('approved', 'cancelled')) or (old.status = 'approved' and new.status = 'cancelled')) then
      raise exception 'That status change is not allowed';
    end if;
    if old.status <> 'draft' and new.questions is distinct from old.questions then
      raise exception 'Questions cannot change after approval';
    end if;
    if jsonb_array_length(new.questions) = 0 and new.status = 'approved' then
      raise exception 'Add at least one question before approving';
    end if;
    new.consent_at := old.consent_at; new.started_at := old.started_at; new.completed_at := old.completed_at;
    new.created_by := old.created_by;
    new.approved_by := old.approved_by; new.approved_at := old.approved_at; new.expires_at := old.expires_at;
  end if;

  if new.status = 'approved' and old.status = 'draft' then
    if app.stage not in ('shortlisted', 'interview', 'offer') then
      raise exception 'AI interviews are only for shortlisted candidates';
    end if;
    new.approved_by := auth.uid();
    new.approved_at := now();
    new.expires_at := now() + interval '7 days';
    insert into public.notifications (user_id, title, body, href)
    values (app.applicant_id, 'You have an AI interview to complete',
            job.title || ': the recruiter has approved a short AI interview call. Open your application to start it within 7 days.',
            '/applications/' || app.id || '/ai-interview');
  end if;
  return new;
end $$;

create trigger ai_interviews_guard before insert or update on public.ai_interviews
  for each row execute function public.guard_ai_interview();

create or replace function public.start_ai_interview(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.ai_interviews;
begin
  select * into i from public.ai_interviews where id = p_id;
  if i.id is null or not public.is_my_application(i.application_id) then raise exception 'Interview not found'; end if;
  if i.status not in ('approved', 'in_progress') then raise exception 'This interview is not available'; end if;
  if i.expires_at < now() then raise exception 'This interview link has expired'; end if;
  perform set_config('app.ai_interview_fn', '1', true);
  update public.ai_interviews set status = 'in_progress', started_at = coalesce(started_at, now()), consent_at = coalesce(consent_at, now()) where id = p_id;
  perform set_config('app.ai_interview_fn', '', true);
end $$;

create or replace function public.submit_ai_interview(p_id uuid, p_answers jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  i public.ai_interviews;
  app public.applications;
  job public.jobs;
  q jsonb;
  a jsonb;
  applicant_name text;
begin
  select * into i from public.ai_interviews where id = p_id;
  if i.id is null or not public.is_my_application(i.application_id) then raise exception 'Interview not found'; end if;
  if i.status <> 'in_progress' then raise exception 'This interview is not in progress'; end if;
  if i.expires_at < now() then raise exception 'This interview link has expired'; end if;

  -- the question text always comes from the approved questions, never from the browser
  for q in select * from jsonb_array_elements(i.questions) loop
    select x into a from jsonb_array_elements(p_answers) x where x ->> 'question_id' = q ->> 'id' limit 1;
    insert into public.ai_interview_answers (interview_id, question_id, question_text, answer, input_mode, duration_seconds)
    values (p_id, q ->> 'id', q ->> 'text',
            left(coalesce(a ->> 'answer', ''), 4000),
            case when a ->> 'input_mode' = 'voice' then 'voice' else 'typed' end,
            nullif(a ->> 'duration_seconds', '')::integer)
    on conflict (interview_id, question_id) do update set answer = excluded.answer, input_mode = excluded.input_mode, duration_seconds = excluded.duration_seconds;
  end loop;

  perform set_config('app.ai_interview_fn', '1', true);
  update public.ai_interviews set status = 'completed', completed_at = now() where id = p_id;
  perform set_config('app.ai_interview_fn', '', true);

  select * into app from public.applications where id = i.application_id;
  select * into job from public.jobs where id = app.job_id;
  select full_name into applicant_name from public.profiles where id = app.applicant_id;
  insert into public.notifications (user_id, title, body, href)
  values (job.recruiter_id, 'AI interview completed',
          coalesce(nullif(applicant_name, ''), 'An applicant') || ' finished the AI interview for ' || job.title || '. Open the candidate to read the summary.',
          '/recruiter/candidates/' || app.id);
end $$;

revoke execute on function public.guard_ai_interview() from public, anon, authenticated;
revoke execute on function public.start_ai_interview(uuid), public.submit_ai_interview(uuid, jsonb) from public, anon;
grant execute on function public.start_ai_interview(uuid), public.submit_ai_interview(uuid, jsonb) to authenticated;
