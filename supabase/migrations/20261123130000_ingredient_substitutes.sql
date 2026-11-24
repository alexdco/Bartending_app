-- Ingredient substitution suggestions (spec 0065 build plan task 1).
--
-- Adds the reviewed swap catalog (ingredient_substitutes plus its note
-- translations), ingredients.substitutes_reviewed_at, and extends
-- fetch_bar_service_data with house_recipes[].alcohol_free and a new
-- substitutes column carrying the swaps for the bar's currently 86'd
-- ingredients. Adding an output column changes the function's return type,
-- which create or replace cannot do, so the function is dropped and
-- recreated with the same one argument signature and the same grants
-- (authenticated only; public and anon revoked, as in
-- 20260915180100_bartender_mode_revoke_anon_execute.sql).
--
-- Ends with a few hand written swaps (lime, lemon, simple syrup) so the
-- tracer bullet has real data; the catalog wide seeding comes from the
-- propose and apply scripts (build plan task 8).
-- Spec: docs/specs/0065-ingredient-substitution-suggestions/index.md

begin;

-- ingredients.substitutes_reviewed_at ------------------------------------------

alter table public.ingredients
  add column substitutes_reviewed_at timestamptz;

comment on column public.ingredients.substitutes_reviewed_at is
  'When the swap list for this ingredient was last reviewed and applied. Null = not reviewed (Quick Build makes no claim); set with zero ingredient_substitutes rows = no good substitute (spec 0065 AC-5).';

-- ingredient_substitutes -------------------------------------------------------

create table public.ingredient_substitutes (
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  substitute_ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  rank smallint not null,
  ratio numeric(4, 2) not null default 1,
  note text,
  note_hash text generated always as (md5(note)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (ingredient_id, substitute_ingredient_id),
  constraint ingredient_substitutes_not_self_check
    check (substitute_ingredient_id <> ingredient_id),
  constraint ingredient_substitutes_rank_check
    check (rank between 1 and 5),
  constraint ingredient_substitutes_ratio_check
    check (ratio between 0.25 and 4),
  constraint ingredient_substitutes_note_check
    check (note is null or (note = btrim(note) and char_length(note) between 1 and 120)),
  constraint ingredient_substitutes_ingredient_rank_key
    unique (ingredient_id, rank)
);

comment on table public.ingredient_substitutes is
  'One way swaps: if ingredient_id is out, use substitute_ingredient_id at ratio times the amount. Seeded by Haiku, reviewed by hand, written only from the apply SQL run in the SQL editor (spec 0065).';

create index ingredient_substitutes_substitute_ingredient_id_idx
  on public.ingredient_substitutes (substitute_ingredient_id);

create trigger ingredient_substitutes_set_updated_at
  before update on public.ingredient_substitutes
  for each row execute function public.set_updated_at();

-- ingredient_substitute_translations -------------------------------------------

create table public.ingredient_substitute_translations (
  ingredient_id uuid not null,
  substitute_ingredient_id uuid not null,
  locale text not null references public.supported_locales (code),
  note text not null,
  source_note_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (ingredient_id, substitute_ingredient_id, locale),
  foreign key (ingredient_id, substitute_ingredient_id)
    references public.ingredient_substitutes (ingredient_id, substitute_ingredient_id)
    on delete cascade,
  constraint ingredient_substitute_translations_locale_check
    check (locale <> 'en'),
  constraint ingredient_substitute_translations_note_check
    check (note = btrim(note) and char_length(note) between 1 and 120)
);

comment on table public.ingredient_substitute_translations is
  'Translated swap notes. Shown only while source_note_hash equals the swap''s note_hash; otherwise the English note shows (spec 0065 AC-9).';

create trigger ingredient_substitute_translations_set_updated_at
  before update on public.ingredient_substitute_translations
  for each row execute function public.set_updated_at();

-- RLS and grants: read for everyone, no client writes (AC-15) ------------------

alter table public.ingredient_substitutes enable row level security;
alter table public.ingredient_substitute_translations enable row level security;

create policy ingredient_substitutes_select on public.ingredient_substitutes
  for select
  to anon, authenticated
  using (true);

create policy ingredient_substitute_translations_select on public.ingredient_substitute_translations
  for select
  to anon, authenticated
  using (true);

revoke all on table public.ingredient_substitutes from anon, authenticated;
revoke all on table public.ingredient_substitute_translations from anon, authenticated;
grant select on table public.ingredient_substitutes to anon, authenticated;
grant select on table public.ingredient_substitute_translations to anon, authenticated;

-- fetch_bar_service_data: + house_recipes[].alcohol_free, + substitutes ---------

drop function public.fetch_bar_service_data(uuid);

create function public.fetch_bar_service_data(p_bar_id uuid)
returns table (
  menu jsonb,
  house_recipes jsonb,
  stock_86 jsonb,
  substitutes jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.jwt() ->> 'is_anonymous') = 'true'
    or not exists (
      select 1 from public.bar_members
      where bar_id = p_bar_id and user_id = auth.uid()
    )
  then
    raise exception 'not a member of this bar' using errcode = '42501';
  end if;

  return query
  select
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', bmi.id,
            'bar_recipe_id', bmi.bar_recipe_id,
            'name', br.name,
            'sort_order', bmi.sort_order,
            'active', bmi.active
          )
          order by bmi.sort_order
        )
        from public.bar_menu_items bmi
        join public.bar_recipes br on br.id = bmi.bar_recipe_id
        where bmi.bar_id = p_bar_id and br.deleted_at is null
      ),
      '[]'::jsonb
    ) as menu,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', br.id,
            'base_recipe_id', br.base_recipe_id,
            'name', br.name,
            'method', br.method,
            'straining', br.straining,
            'instructions', br.instructions,
            'glass', br.glass,
            'ice', br.ice,
            'garnish', br.garnish,
            -- AC-6: a based house recipe follows its base recipe's status
            -- (only 'non_alcoholic' counts); a standalone one is alcohol
            -- free when none of its ingredients is a spirit or liqueur.
            'alcohol_free', case
              when br.base_recipe_id is not null then coalesce(
                (
                  select r.alcoholic_status = 'non_alcoholic'
                  from public.recipes r
                  where r.id = br.base_recipe_id
                ),
                false
              )
              else not exists (
                select 1
                from public.bar_recipe_ingredients bri
                join public.ingredients i on i.id = bri.ingredient_id
                where bri.bar_recipe_id = br.id
                  and i.category in ('spirit', 'liqueur')
              )
            end,
            'ingredients', coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'ingredient_id', bri.ingredient_id,
                    'name', i.name,
                    'amount_value', bri.amount_value,
                    'amount_unit', bri.amount_unit,
                    'sort_order', bri.sort_order
                  )
                  order by bri.sort_order
                )
                from public.bar_recipe_ingredients bri
                join public.ingredients i on i.id = bri.ingredient_id
                where bri.bar_recipe_id = br.id
              ),
              '[]'::jsonb
            )
          )
          order by br.name
        )
        from public.bar_recipes br
        where br.bar_id = p_bar_id and br.deleted_at is null
      ),
      '[]'::jsonb
    ) as house_recipes,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('ingredient_id', bis.ingredient_id, 'is_86d', bis.is_86d)
        )
        from public.bar_ingredient_stock bis
        where bis.bar_id = p_bar_id and bis.is_86d = true
      ),
      '[]'::jsonb
    ) as stock_86,
    -- One entry per currently 86'd ingredient, every rank included, every
    -- locale's translations shipped: stock filtering, locale choice, and the
    -- note hash check happen client side in pickSubstitutes (spec 0065).
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'ingredient_id', oi.id,
            'reviewed', oi.substitutes_reviewed_at is not null,
            'allergens', oi.allergens,
            'items', coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'substitute_ingredient_id', s.substitute_ingredient_id,
                    'name', si.name,
                    'name_translations', coalesce(
                      (
                        select jsonb_object_agg(it.locale, it.name)
                        from public.ingredient_translations it
                        where it.ingredient_id = si.id
                      ),
                      '{}'::jsonb
                    ),
                    'rank', s.rank,
                    'ratio', s.ratio,
                    'note', s.note,
                    'note_hash', s.note_hash,
                    'note_translations', coalesce(
                      (
                        select jsonb_object_agg(
                          st.locale,
                          jsonb_build_object('note', st.note, 'source_note_hash', st.source_note_hash)
                        )
                        from public.ingredient_substitute_translations st
                        where st.ingredient_id = s.ingredient_id
                          and st.substitute_ingredient_id = s.substitute_ingredient_id
                      ),
                      '{}'::jsonb
                    ),
                    'category', si.category,
                    'allergens', si.allergens
                  )
                  order by s.rank
                )
                from public.ingredient_substitutes s
                join public.ingredients si on si.id = s.substitute_ingredient_id
                where s.ingredient_id = oi.id
              ),
              '[]'::jsonb
            )
          )
        )
        from public.bar_ingredient_stock bis
        join public.ingredients oi on oi.id = bis.ingredient_id
        where bis.bar_id = p_bar_id and bis.is_86d = true
      ),
      '[]'::jsonb
    ) as substitutes;
end;
$$;

revoke all on function public.fetch_bar_service_data(uuid) from public;
revoke execute on function public.fetch_bar_service_data(uuid) from anon;
grant execute on function public.fetch_bar_service_data(uuid) to authenticated;

-- Hand written starter swaps (build plan task 1) --------------------------------
-- Looked up by name; a name missing from the catalog just inserts nothing.

with swaps (ingredient_name, substitute_name, rank, ratio, note) as (
  values
    ('Lime Juice', 'Lemon Juice', 1, 1.00, 'A little less sharp; fine in sours'),
    ('Lime', 'Lemon', 1, 1.00, null),
    ('Lemon Juice', 'Lime Juice', 1, 1.00, 'Sharper and more floral'),
    ('Lemon', 'Lime', 1, 1.00, null),
    ('Simple Syrup', 'Sugar Syrup', 1, 1.00, null),
    ('Simple Syrup', 'Agave Syrup', 2, 0.67, 'Sweeter than simple syrup, so use less'),
    ('Simple Syrup', 'Honey Syrup', 3, 1.00, 'Adds a floral honey note'),
    ('Simple Syrup', 'Orgeat Syrup', 4, 1.00, 'Adds almond flavor; best in tiki and sours'),
    ('Sugar Syrup', 'Simple Syrup', 1, 1.00, null)
),
resolved as (
  select o.id as ingredient_id, s.id as substitute_ingredient_id, w.rank, w.ratio, w.note
  from swaps w
  join public.ingredients o on o.name = w.ingredient_name
  join public.ingredients s on s.name = w.substitute_name
)
insert into public.ingredient_substitutes (ingredient_id, substitute_ingredient_id, rank, ratio, note)
select ingredient_id, substitute_ingredient_id, rank, ratio, note
from resolved
on conflict (ingredient_id, substitute_ingredient_id) do nothing;

update public.ingredients
set substitutes_reviewed_at = now()
where name in ('Lime Juice', 'Lime', 'Lemon Juice', 'Lemon', 'Simple Syrup', 'Sugar Syrup')
  and substitutes_reviewed_at is null;

notify pgrst, 'reload schema';

commit;
