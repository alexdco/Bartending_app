-- learn_articles ------------------------------------------------------------
--
-- Spec 0025 (learn section): short educational articles about bar tools,
-- spirits, wine, and beer, grouped into a fixed category set. Drafted by an
-- offline Haiku script into status = 'draft', reviewed and published by
-- editing the row directly in Supabase Studio (no in app publish action).
-- Standalone table, no foreign keys.

create table public.learn_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  body_markdown text not null,
  status text not null default 'draft',
  source_topic text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

alter table public.learn_articles
  add constraint learn_articles_category_check
  check (category in ('tools', 'spirits', 'wine', 'beer', 'other'));

alter table public.learn_articles
  add constraint learn_articles_status_check
  check (status in ('draft', 'published', 'archived'));

comment on table public.learn_articles is
  'Educational articles for the Learn section (spec 0025). Drafted via Haiku, reviewed/published by hand in Studio.';
comment on column public.learn_articles.source_topic is
  'The topic prompt given to Haiku when the draft was generated, kept for audit/regeneration.';
comment on column public.learn_articles.published_at is
  'Set automatically the first time status transitions to published; see learn_articles_set_published_at trigger.';

create index learn_articles_category_status_idx
  on public.learn_articles (category, status, published_at desc, id);

create trigger learn_articles_set_updated_at
  before update on public.learn_articles
  for each row
  execute function public.set_updated_at();

-- Sets published_at the first time status moves to published (only when
-- still null), so the row always reflects "first published" and the
-- published_at desc ordered list never silently drops a forgotten manual
-- edit that left published_at null.
create function public.learn_articles_set_published_at()
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

create trigger learn_articles_set_published_at
  before update on public.learn_articles
  for each row
  execute function public.learn_articles_set_published_at();

alter table public.learn_articles enable row level security;

-- Public read: anyone, including a guest with no session, sees only
-- published rows (AC-4, AC-6, AC-9). RLS is the security boundary; any
-- client side status filter is a courtesy on top of this.
create policy learn_articles_select on public.learn_articles
  for select
  to anon, authenticated
  using (status = 'published');

-- No insert/update/delete policy for any client reachable role: the
-- generation script and manual review both use the service role key, which
-- bypasses RLS by design.
revoke insert, update, delete on public.learn_articles from anon, authenticated;
