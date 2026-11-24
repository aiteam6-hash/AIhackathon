-- Eligibility is decided by the database when an application is created. The browser's values are ignored.
create or replace function public.compute_eligibility(p_applicant uuid, p_job uuid, p_notice integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  a public.applicant_profiles;
  j public.jobs;
  checks jsonb := '[]'::jsonb;
  req text[];
  missing text[];
  cities text[];
  in_city boolean;
  deg_req text;
  deg_has text;
begin
  select * into a from public.applicant_profiles where user_id = p_applicant;
  select * into j from public.jobs where id = p_job;
  if a.user_id is null or j.id is null then raise exception 'Profile or job not found'; end if;

  checks := checks || jsonb_build_object(
    'key', 'experience',
    'label', trim_scale(j.min_experience)::text || '+ years of experience',
    'pass', a.experience_years >= j.min_experience,
    'detail', format('Your profile shows %s %s; the role asks for at least %s.',
      trim_scale(a.experience_years)::text, case when a.experience_years = 1 then 'year' else 'years' end, trim_scale(j.min_experience)::text));

  select coalesce(array_agg(s.name order by s.name), '{}') into req
    from public.job_skills js join public.skills s on s.id = js.skill_id
    where js.job_id = p_job and js.kind = 'required';
  select coalesce(array_agg(s.name order by s.name), '{}') into missing
    from public.job_skills js join public.skills s on s.id = js.skill_id
    where js.job_id = p_job and js.kind = 'required'
      and not exists (select 1 from public.applicant_skills k where k.applicant_id = p_applicant and k.skill_id = js.skill_id);
  checks := checks || jsonb_build_object(
    'key', 'skills',
    'label', case when cardinality(req) > 0 then 'Required skills: ' || array_to_string(req, ', ') else 'Required skills' end,
    'pass', cardinality(missing) = 0,
    'detail', case when cardinality(missing) > 0 then 'Missing from your profile: ' || array_to_string(missing, ', ') || '.'
                   when cardinality(req) > 0 then 'You list every required skill.'
                   else 'No specific skills are required.' end);

  cities := case when cardinality(j.allowed_locations) > 0 then j.allowed_locations else array[j.location] end;
  in_city := exists (select 1 from unnest(cities) c where lower(trim(c)) = lower(trim(a.location)));
  checks := checks || jsonb_build_object(
    'key', 'location',
    'label', case when j.work_mode = 'remote' then 'Location (remote role)' else 'Based in ' || array_to_string(cities, ' or ') end,
    'pass', j.work_mode = 'remote' or in_city or a.open_to_relocate,
    'detail', case when j.work_mode = 'remote' then 'This role is remote, so location does not restrict you.'
                   when in_city then 'You are based in ' || a.location || '.'
                   when a.open_to_relocate then 'You are in ' || a.location || ' but open to relocating.'
                   else 'You are in ' || a.location || ' and not open to relocating; the role is based in ' || array_to_string(cities, ' or ') || '.' end);

  checks := checks || jsonb_build_object(
    'key', 'notice',
    'label', 'Notice period up to ' || j.max_notice_days || ' days',
    'pass', p_notice <= j.max_notice_days,
    'detail', 'Your notice period is ' || p_notice || ' days; the team can wait ' || j.max_notice_days || '.');

  deg_req := case j.degree_required when 'bachelors' then 'Bachelor''s' when 'masters' then 'Master''s' when 'phd' then 'PhD' when 'diploma' then 'Diploma' else 'None' end;
  deg_has := case a.education_degree when 'bachelors' then 'Bachelor''s' when 'masters' then 'Master''s' when 'phd' then 'PhD' when 'diploma' then 'Diploma' else 'none listed' end;
  checks := checks || jsonb_build_object(
    'key', 'degree',
    'label', case when j.degree_required = 'none' then 'Degree (not required)' else deg_req || ' degree or higher' end,
    'pass', a.education_degree >= j.degree_required,
    'detail', case when j.degree_required = 'none' then 'No degree is required.'
                   else 'Your highest qualification is ' || deg_has || '; the role asks for ' || deg_req || '.' end);

  return checks;
end $$;

create or replace function public.apply_eligibility() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  checks jsonb;
  ok boolean;
  j public.jobs;
begin
  select * into j from public.jobs where id = new.job_id;
  checks := public.compute_eligibility(new.applicant_id, new.job_id, new.notice_days);
  select bool_and((c ->> 'pass')::boolean) into ok from jsonb_array_elements(checks) c;
  if not ok and not j.allow_ineligible then
    raise exception 'You do not meet the hard requirements for this role';
  end if;
  if new.resume_id is not null and not exists (
    select 1 from public.resumes r where r.id = new.resume_id and r.applicant_id = new.applicant_id) then
    raise exception 'That resume does not belong to you';
  end if;
  -- whatever the browser sent for these three columns is replaced with the server's own result
  new.eligibility_checks := checks;
  new.eligible := ok;
  new.applied_anyway := not ok;
  return new;
end $$;

create trigger applications_eligibility before insert on public.applications
  for each row execute function public.apply_eligibility();

revoke execute on function public.compute_eligibility(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.apply_eligibility() from public, anon, authenticated;
