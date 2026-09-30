-- quizzes / quiz_questions / quiz_attempts --------------------------------
--
-- Spec 0026 (learn quizzes): short multiple choice or true/false quizzes on
-- a Learn category or a recipe tag/region grouping. Drafted by an offline
-- Haiku script into status = 'draft', reviewed and published by editing the
-- row directly in Supabase Studio (no in app publish action), mirroring
-- learn_articles (spec 0025).

create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_type text not null,
  source_ref text not null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

alter table public.quizzes
  add constraint quizzes_source_type_check
  check (source_type in ('learn_category', 'recipe_tag', 'recipe_region'));

alter table public.quizzes
  add constraint quizzes_status_check
  check (status in ('draft', 'published', 'archived'));

comment on table public.quizzes is
  'Quizzes on a Learn category or a recipe tag/region grouping (spec 0026). Drafted via Haiku, reviewed/published by hand in Studio.';
comment on column public.quizzes.source_ref is
  'The learn_articles.category value, the tags.id, or the region value, depending on source_type. Not a foreign key: it points at different id shapes depending on source_type.';
comment on column public.quizzes.published_at is
  'Set automatically the first time status transitions to published; see quizzes_set_published_at trigger.';

create index quizzes_source_status_idx
  on public.quizzes (source_type, source_ref, status, published_at desc, id);

create trigger quizzes_set_updated_at
  before update on public.quizzes
  for each row
  execute function public.set_updated_at();

-- Sets published_at the first time status moves to published (only when
-- still null), matching learn_articles_set_published_at's semantics.
create function public.quizzes_set_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and old.status is distinct from 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger quizzes_set_published_at
  before update on public.quizzes
  for each row
  execute function public.quizzes_set_published_at();

alter table public.quizzes enable row level security;

-- Public read: anyone, including a guest with no session, sees only
-- published quizzes (AC-6, AC-7, AC-11). RLS is the security boundary; any
-- client side status filter is a courtesy on top of this.
create policy quizzes_select on public.quizzes
  for select
  to anon, authenticated
  using (status = 'published');

-- No insert/update/delete policy for any client reachable role: the
-- generation scripts and manual review both use the service role key, which
-- bypasses RLS by design.
revoke insert, update, delete on public.quizzes from anon, authenticated;

-- quiz_questions ------------------------------------------------------------

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  question_type text not null,
  prompt text not null,
  options jsonb not null,
  correct_option_index integer not null,
  explanation text,
  sort_order integer not null
);

alter table public.quiz_questions
  add constraint quiz_questions_question_type_check
  check (question_type in ('multiple_choice', 'true_false'));

-- options has exactly 2 entries for true_false and exactly 4 for
-- multiple_choice (AC-2).
alter table public.quiz_questions
  add constraint quiz_questions_options_length_check
  check (
    (question_type = 'true_false' and jsonb_array_length(options) = 2)
    or (question_type = 'multiple_choice' and jsonb_array_length(options) = 4)
  );

-- correct_option_index is always a valid index into options.
alter table public.quiz_questions
  add constraint quiz_questions_correct_option_index_check
  check (correct_option_index >= 0 and correct_option_index < jsonb_array_length(options));

-- The same fixed display order every time a quiz is opened (AC-2) cannot
-- flake from a duplicate or tied sort_order.
alter table public.quiz_questions
  add constraint quiz_questions_quiz_id_sort_order_key
  unique (quiz_id, sort_order);

create index quiz_questions_quiz_id_idx on public.quiz_questions (quiz_id, sort_order, id);

alter table public.quiz_questions enable row level security;

-- Public read only when the parent quiz is published; a blanket using(true)
-- would leak draft questions even though the parent quiz correctly hides
-- (AC-6).
create policy quiz_questions_select on public.quiz_questions
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.quizzes
      where quizzes.id = quiz_questions.quiz_id
        and quizzes.status = 'published'
    )
  );

revoke insert, update, delete on public.quiz_questions from anon, authenticated;

-- quiz_attempts ---------------------------------------------------------

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  score integer not null,
  total integer not null,
  completed_at timestamptz not null default now()
);

alter table public.quiz_attempts
  add constraint quiz_attempts_score_total_check
  check (score >= 0 and total > 0 and score <= total);

-- One row per (quiz_id, user_id): "best score kept" is an upsert, not a
-- growing history (AC-5).
alter table public.quiz_attempts
  add constraint quiz_attempts_quiz_id_user_id_key
  unique (quiz_id, user_id);

create index quiz_attempts_user_id_idx on public.quiz_attempts (user_id);

alter table public.quiz_attempts enable row level security;

-- Caller scoped: a user only ever sees or writes their own attempt, guest
-- or signed in, same shape as favorites/pantry_items.
create policy quiz_attempts_select on public.quiz_attempts
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy quiz_attempts_insert on public.quiz_attempts
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy quiz_attempts_update on public.quiz_attempts
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- submit_quiz_attempt --------------------------------------------------
--
-- PostgREST upsert cannot express a conditional WHERE on the update branch,
-- so "only overwrite if the new score is higher" (AC-5) needs a function.
-- security invoker: RLS on quiz_attempts still applies, the caller can only
-- ever affect their own row.
create function public.submit_quiz_attempt(p_quiz_id uuid, p_score integer, p_total integer)
returns public.quiz_attempts
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.quiz_attempts;
begin
  insert into public.quiz_attempts (quiz_id, user_id, score, total, completed_at)
  values (p_quiz_id, (select auth.uid()), p_score, p_total, now())
  on conflict (quiz_id, user_id) do update
    set score = excluded.score,
        total = excluded.total,
        completed_at = excluded.completed_at
    where excluded.score > public.quiz_attempts.score
  returning * into result;

  if result.id is null then
    select * into result
    from public.quiz_attempts
    where quiz_id = p_quiz_id and user_id = (select auth.uid());
  end if;

  return result;
end;
$$;

revoke all on function public.submit_quiz_attempt(uuid, integer, integer) from public;
grant execute on function public.submit_quiz_attempt(uuid, integer, integer) to authenticated;
