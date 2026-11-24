-- The AI route logs each Claude call (model, tokens, timing) under the caller's own id.
create policy ai_generations_insert on public.ai_generations for insert to authenticated
  with check (created_by = (select auth.uid()));
