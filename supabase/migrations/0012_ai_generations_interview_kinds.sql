-- The AI call log also records interview question drafts and interview summaries.
alter table public.ai_generations drop constraint ai_generations_kind_check;
alter table public.ai_generations add constraint ai_generations_kind_check
  check (kind in ('parse_resume', 'score', 'summary', 'feedback', 'criteria', 'job_description', 'interview_questions', 'interview_summary'));
