-- Notify the applicant when an interview is scheduled, and the recruiter when it is answered or an application is withdrawn.
create or replace function public.on_interview_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  app public.applications;
  job public.jobs;
  applicant_name text;
begin
  select * into app from public.applications where id = new.application_id;
  select * into job from public.jobs where id = app.job_id;

  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, title, body, href)
    values (app.applicant_id, 'Interview scheduled',
            'An interview for ' || job.title || ' has been scheduled. Open your application for the date, time and details.',
            '/applications/' || app.id);
  elsif new.status is distinct from old.status then
    select full_name into applicant_name from public.profiles where id = app.applicant_id;
    insert into public.notifications (user_id, title, body, href)
    values (job.recruiter_id,
            case new.status when 'accepted' then 'Interview accepted' else 'Reschedule requested' end,
            coalesce(nullif(applicant_name, ''), 'An applicant') ||
              case new.status when 'accepted' then ' accepted' else ' asked to reschedule' end ||
              ' the interview for ' || job.title || '.',
            '/recruiter/candidates/' || app.id);
  end if;
  return new;
end $$;

create trigger interviews_notify after insert or update on public.interviews
  for each row execute function public.on_interview_change();

create or replace function public.on_application_withdrawn() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  job public.jobs;
  applicant_name text;
begin
  select * into job from public.jobs where id = new.job_id;
  select full_name into applicant_name from public.profiles where id = new.applicant_id;
  insert into public.notifications (user_id, title, body, href)
  values (job.recruiter_id, 'Application withdrawn',
          coalesce(nullif(applicant_name, ''), 'An applicant') || ' withdrew from ' || job.title || '.',
          '/recruiter/jobs/' || job.id);
  return new;
end $$;

create trigger applications_withdrawn_notify after update of stage on public.applications
  for each row when (new.stage = 'withdrawn' and old.stage is distinct from 'withdrawn')
  execute function public.on_application_withdrawn();

revoke execute on function public.on_interview_change() from public, anon, authenticated;
revoke execute on function public.on_application_withdrawn() from public, anon, authenticated;
