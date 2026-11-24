-- Shortlist: helper functions and triggers.
-- Every security definer function pins search_path to '' and uses fully qualified names.

create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_updated            before update on public.profiles            for each row execute function public.set_updated_at();
create trigger recruiter_profiles_updated  before update on public.recruiter_profiles  for each row execute function public.set_updated_at();
create trigger applicant_profiles_updated  before update on public.applicant_profiles  for each row execute function public.set_updated_at();
create trigger jobs_updated                before update on public.jobs                for each row execute function public.set_updated_at();
create trigger applications_updated        before update on public.applications        for each row execute function public.set_updated_at();

/* ---- a profile row is created automatically when someone signs in with Google ---- */
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

/* ---- role can be chosen once; after that it is fixed ---- */
create or replace function public.protect_role() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.role is not null and new.role is distinct from old.role then
    raise exception 'Role cannot be changed once it has been chosen';
  end if;
  return new;
end $$;

create trigger profiles_protect_role before update of role on public.profiles
  for each row execute function public.protect_role();

-- Called after the first sign-in. Sets the role and creates the matching profile row.
create or replace function public.set_my_role(p_role public.user_role, p_company_name text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if (select role from public.profiles where id = uid) is not null then
    raise exception 'Role has already been chosen';
  end if;
  if p_role = 'recruiter' and coalesce(trim(p_company_name), '') = '' then
    raise exception 'A company name is required for recruiters';
  end if;

  update public.profiles set role = p_role where id = uid;
  if p_role = 'recruiter' then
    insert into public.recruiter_profiles (user_id, company_name) values (uid, trim(p_company_name));
  else
    insert into public.applicant_profiles (user_id) values (uid);
  end if;
end $$;

/* ---- ownership checks used by row-level security ---- */
create or replace function public.owns_job(p_job_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.jobs where id = p_job_id and recruiter_id = auth.uid());
$$;

create or replace function public.owns_application_job(p_app_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.applications a join public.jobs j on j.id = a.job_id
    where a.id = p_app_id and j.recruiter_id = auth.uid()
  );
$$;

create or replace function public.is_my_application(p_app_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.applications where id = p_app_id and applicant_id = auth.uid());
$$;

-- True when this recruiter has an application from the given applicant on one of their jobs.
create or replace function public.recruiter_sees_applicant(p_applicant_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.applications a join public.jobs j on j.id = a.job_id
    where a.applicant_id = p_applicant_id and j.recruiter_id = auth.uid()
  );
$$;

/* ---- stage history, rejection bookkeeping and notifications ---- */
create or replace function public.on_application_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  actor_kind text;
  job_row public.jobs;
  applicant_name text;
begin
  select * into job_row from public.jobs where id = new.job_id;

  actor_kind := case
    when actor is null then 'system'
    when actor = new.applicant_id then 'applicant'
    else 'recruiter' end;

  if tg_op = 'INSERT' then
    insert into public.stage_events (application_id, from_stage, to_stage, actor_type, actor_id)
    values (new.id, null, new.stage, actor_kind, actor);
    select full_name into applicant_name from public.profiles where id = new.applicant_id;
    insert into public.notifications (user_id, title, body, href)
    values (job_row.recruiter_id, 'New application',
            coalesce(nullif(applicant_name, ''), 'An applicant') || ' applied for ' || job_row.title || '.',
            '/recruiter/candidates/' || new.id);
    return new;
  end if;

  if new.stage is distinct from old.stage then
    insert into public.stage_events (application_id, from_stage, to_stage, actor_type, actor_id)
    values (new.id, old.stage, new.stage, actor_kind, actor);

    -- the stage at which someone was turned down is shown to the applicant
    if new.stage = 'rejected' and new.rejected_at_stage is null then
      new.rejected_at_stage := old.stage;
    elsif new.stage <> 'rejected' then
      new.rejected_at_stage := null;
    end if;

    if actor_kind <> 'applicant' then
      insert into public.notifications (user_id, title, body, href)
      values (new.applicant_id,
        case new.stage
          when 'rejected' then 'Update on ' || job_row.title
          when 'offer' then 'Offer for ' || job_row.title
          when 'hired' then 'You are hired: ' || job_row.title
          else 'Application moved to ' || new.stage::text end,
        case new.stage
          when 'rejected' then 'Your application was not taken forward at the ' || coalesce(new.rejected_at_stage, old.stage)::text || ' stage. Read the feedback.'
          else 'Your ' || job_row.title || ' application is now at ' || new.stage::text || '.' end,
        '/applications/' || new.id);
    end if;
  end if;
  return new;
end $$;

create trigger applications_after_insert after insert on public.applications
  for each row execute function public.on_application_change();
create trigger applications_before_update before update on public.applications
  for each row execute function public.on_application_change();

/* ---- applicant-side actions that must not be open-ended updates ---- */
create or replace function public.withdraw_application(p_app_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.applications set stage = 'withdrawn'
  where id = p_app_id and applicant_id = auth.uid() and stage not in ('rejected', 'withdrawn', 'hired');
  if not found then raise exception 'Application not found or cannot be withdrawn'; end if;
end $$;

create or replace function public.respond_to_interview(p_interview_id uuid, p_status public.interview_status)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_status = 'scheduled' then raise exception 'Invalid response'; end if;
  update public.interviews i set status = p_status
  from public.applications a
  where i.id = p_interview_id and a.id = i.application_id and a.applicant_id = auth.uid();
  if not found then raise exception 'Interview not found'; end if;
end $$;

/* ---- recruiter one-click auto-filter: rejects waiting applicants who fail a hard requirement ---- */
create or replace function public.auto_filter_ineligible(p_job_id uuid) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare ids uuid[];
begin
  if not public.owns_job(p_job_id) then raise exception 'Not your job'; end if;
  with moved as (
    update public.applications set stage = 'rejected'
    where job_id = p_job_id and stage in ('applied', 'screening') and eligible = false
    returning id
  )
  select coalesce(array_agg(id), '{}') into ids from moved;
  return ids;
end $$;

grant execute on function public.set_my_role(public.user_role, text) to authenticated;
grant execute on function public.withdraw_application(uuid) to authenticated;
grant execute on function public.respond_to_interview(uuid, public.interview_status) to authenticated;
grant execute on function public.auto_filter_ineligible(uuid) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.on_application_change() from public, anon, authenticated;
