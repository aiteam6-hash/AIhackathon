-- Keeps criteria in the order the recruiter set them.
alter table public.criterion_scores add column position integer not null default 0;
