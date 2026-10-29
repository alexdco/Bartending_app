-- quiz_questions source links -----------------------------------------------
--
-- Spec 0042 (quiz answer source links): each quiz question records the one
-- Learn article or recipe that holds its answer, plus the exact phrase in its
-- explanation to turn into a link on the result screen. All three columns are
-- nullable so this is safe on live rows; "every question has a source" is
-- enforced by the generation and backfill scripts, not the database, so
-- on delete set null can always succeed.
--
-- No RLS change: the new columns inherit the existing quiz_questions read
-- policy (published parent only), and clients still have no write policy.
-- Embedded learn_articles / recipes rows are filtered by their own RLS, so a
-- draft article or soft deleted recipe comes back null to the client.

alter table public.quiz_questions
  add column source_article_id uuid references public.learn_articles (id) on delete set null,
  add column source_recipe_id uuid references public.recipes (id) on delete set null,
  add column source_anchor text;

alter table public.quiz_questions
  add constraint quiz_questions_single_source
  check (num_nonnulls(source_article_id, source_recipe_id) <= 1);

comment on column public.quiz_questions.source_article_id is
  'The Learn article that answers this question (spec 0042). At most one of source_article_id/source_recipe_id is set.';
comment on column public.quiz_questions.source_recipe_id is
  'The recipe that answers this question (spec 0042). At most one of source_article_id/source_recipe_id is set.';
comment on column public.quiz_questions.source_anchor is
  'The exact phrase in explanation to render as the source link (spec 0042). Null or not found falls back to a "Read more" line.';

-- Postgres does not index foreign keys automatically; these keep
-- on delete set null cheap when an article or recipe row is removed.
create index quiz_questions_source_article_id_idx
  on public.quiz_questions (source_article_id);

create index quiz_questions_source_recipe_id_idx
  on public.quiz_questions (source_recipe_id);
