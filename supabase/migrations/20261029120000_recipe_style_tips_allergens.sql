-- Recipe drink style, tips, and allergens (spec 0043).
--
-- 1. New columns and checks: drink style family, style sentence, bartender
--    tip, and presentation tip on recipes (EN) and recipe_translations (ES);
--    a reviewed allergen list on ingredients (null = not reviewed, '{}' =
--    reviewed, none). The family and allergen sets mirror DRINK_STYLES and
--    ALLERGENS in packages/shared (AC-12).
-- 2. fetch_recipe_detail returns the four notes (ES falls back to EN) and
--    each ingredient's allergens. The return type changes, so it is dropped
--    and recreated with its grants; the body is otherwise unchanged from
--    20261026140000_recipe_detail_cocktaildb_credit.sql.
-- 3. apply_recipe_notes and apply_ingredient_allergens: all or nothing bulk
--    writes of reviewed proposals, service role only (AC-8, AC-9).
-- 4. admin_set_recipe_notes and admin_set_ingredient_allergens: admin edits
--    from the web admin (AC-10, AC-11).
--
-- Every text check trims the same whitespace set (space, tab, CR, LF), and
-- 240 counts characters (char_length), matching the zod validators.

-- 1. Columns and checks ------------------------------------------------------

alter table public.recipes
  add column drink_style text,
  add column drink_style_note text,
  add column bartender_tip text,
  add column presentation_tip text;

alter table public.recipes
  add constraint recipes_drink_style_check check (
    drink_style in (
      'sour', 'highball', 'spirit_forward', 'fizz_collins', 'tiki',
      'flip_cream', 'punch', 'shooter', 'hot', 'frozen', 'other'
    )
  ),
  add constraint recipes_drink_style_note_check check (
    drink_style_note = btrim(drink_style_note, E' \t\r\n')
    and char_length(drink_style_note) between 1 and 240
  ),
  add constraint recipes_drink_style_note_needs_style_check check (
    drink_style_note is null or drink_style is not null
  ),
  add constraint recipes_bartender_tip_check check (
    bartender_tip = btrim(bartender_tip, E' \t\r\n')
    and char_length(bartender_tip) between 1 and 240
  ),
  add constraint recipes_presentation_tip_check check (
    presentation_tip = btrim(presentation_tip, E' \t\r\n')
    and char_length(presentation_tip) between 1 and 240
  );

comment on column public.recipes.drink_style is
  'Drink style family (spec 0043), one of DRINK_STYLES in packages/shared. Null = not set; the label is translated in the apps.';
comment on column public.recipes.drink_style_note is
  'One sentence on the drink style, English (spec 0043). Spanish lives in recipe_translations.';
comment on column public.recipes.bartender_tip is
  'Bartender tip, English, 1 to 240 characters (spec 0043).';
comment on column public.recipes.presentation_tip is
  'Presentation tip, English, 1 to 240 characters (spec 0043).';

alter table public.recipe_translations
  add column drink_style_note text,
  add column bartender_tip text,
  add column presentation_tip text;

alter table public.recipe_translations
  add constraint recipe_translations_drink_style_note_check check (
    drink_style_note = btrim(drink_style_note, E' \t\r\n')
    and char_length(drink_style_note) between 1 and 240
  ),
  add constraint recipe_translations_bartender_tip_check check (
    bartender_tip = btrim(bartender_tip, E' \t\r\n')
    and char_length(bartender_tip) between 1 and 240
  ),
  add constraint recipe_translations_presentation_tip_check check (
    presentation_tip = btrim(presentation_tip, E' \t\r\n')
    and char_length(presentation_tip) between 1 and 240
  );

alter table public.ingredients
  add column allergens text[];

alter table public.ingredients
  add constraint ingredients_allergens_check check (
    allergens <@ array[
      'egg', 'milk', 'tree_nuts', 'peanuts', 'gluten', 'soy',
      'sulfites', 'fish', 'shellfish', 'celery', 'sesame', 'mustard'
    ]::text[]
    and array_position(allergens, null) is null
  );

comment on column public.ingredients.allergens is
  'Reviewed allergens (spec 0043), each one of ALLERGENS in packages/shared. Null = not reviewed yet, empty = reviewed, none.';

-- 2. fetch_recipe_detail -----------------------------------------------------

drop function public.fetch_recipe_detail(uuid, text);

create or replace function public.fetch_recipe_detail(p_id uuid, p_locale text default 'en'::text)
returns table (
  id uuid,
  name text,
  instructions text,
  image_url text,
  alcoholic_status text,
  glass text,
  difficulty text,
  method text,
  straining text,
  taste_tags text[],
  is_favorited boolean,
  ingredients jsonb,
  is_cocktaildb_recipe boolean,
  drink_style text,
  drink_style_note text,
  bartender_tip text,
  presentation_tip text
)
language sql
stable
set search_path = ''
as $$
  with resolved_locale as (
    select case when p_locale in ('es') then p_locale else null end as locale
  )
  select
    r.id,
    coalesce(rt.name, r.name) as name,
    coalesce(rt.instructions, r.instructions) as instructions,
    r.image_url,
    r.alcoholic_status,
    coalesce(rt.glass, r.glass) as glass,
    r.difficulty,
    r.method,
    r.straining,
    coalesce(
      (
        select array_agg(coalesce(tt.name, t.name) order by t.normalized_name)
        from public.recipe_tags rtags
        join public.tags t on t.id = rtags.tag_id and t.kind = 'taste'
        left join public.tag_translations tt
          on tt.tag_id = t.id and tt.locale = (select locale from resolved_locale)
        where rtags.recipe_id = r.id
      ),
      array[]::text[]
    ) as taste_tags,
    exists (
      select 1 from public.favorites f
      where f.recipe_id = r.id and f.user_id = auth.uid()
    ) as is_favorited,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'ingredient_id', ri.ingredient_id,
            'name', coalesce(it.name, i.name),
            'measure', coalesce(rit.measure, ri.measure),
            'sort_order', ri.sort_order,
            'amount_value', ri.amount_value,
            'amount_unit', ri.amount_unit,
            'category', i.category,
            'is_staple', i.is_staple,
            'allergens', i.allergens
          )
          order by ri.sort_order
        )
        from public.recipe_ingredients ri
        join public.ingredients i on i.id = ri.ingredient_id
        left join public.ingredient_translations it
          on it.ingredient_id = i.id and it.locale = (select locale from resolved_locale)
        left join public.recipe_ingredient_translations rit
          on rit.recipe_id = ri.recipe_id
          and rit.ingredient_id = ri.ingredient_id
          and rit.locale = (select locale from resolved_locale)
        where ri.recipe_id = r.id
      ),
      '[]'::jsonb
    ) as ingredients,
    (r.source = 'catalog' and r.source_id !~ '^custom:') as is_cocktaildb_recipe,
    r.drink_style,
    coalesce(rt.drink_style_note, r.drink_style_note) as drink_style_note,
    coalesce(rt.bartender_tip, r.bartender_tip) as bartender_tip,
    coalesce(rt.presentation_tip, r.presentation_tip) as presentation_tip
  from public.recipes r
  left join public.recipe_translations rt
    on rt.recipe_id = r.id and rt.locale = (select locale from resolved_locale)
  where r.id = p_id
    and r.deleted_at is null;
$$;

revoke all on function public.fetch_recipe_detail(uuid, text) from public;
grant execute on function public.fetch_recipe_detail(uuid, text) to anon, authenticated;

-- 3. apply_recipe_notes ------------------------------------------------------

-- Writes reviewed EN notes to recipes and ES notes to the existing es row of
-- recipe_translations. Validates the whole payload first; one bad row rejects
-- everything (22023). Returns the ids whose ES was skipped (no es row).
create or replace function public.apply_recipe_notes(proposals jsonb)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  bad_count int;
  skipped uuid[];
begin
  perform pg_advisory_xact_lock(hashtext('apply_recipe_notes'));

  if proposals is null or jsonb_typeof(proposals) <> 'array' then
    raise exception 'apply_recipe_notes: proposals must be a JSON array'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(proposals) e
    where jsonb_typeof(e) <> 'object'
      or jsonb_typeof(e -> 'es') is distinct from 'object'
  ) then
    raise exception 'apply_recipe_notes: every proposal must be an object with an es object'
      using errcode = '22023';
  end if;

  create temporary table pg_temp.proposed_notes on commit drop as
  select
    p.id,
    p.drink_style,
    btrim(p.drink_style_note, E' \t\r\n') as drink_style_note,
    btrim(p.bartender_tip, E' \t\r\n') as bartender_tip,
    btrim(p.presentation_tip, E' \t\r\n') as presentation_tip,
    btrim(p.es ->> 'drink_style_note', E' \t\r\n') as es_drink_style_note,
    btrim(p.es ->> 'bartender_tip', E' \t\r\n') as es_bartender_tip,
    btrim(p.es ->> 'presentation_tip', E' \t\r\n') as es_presentation_tip
  from jsonb_to_recordset(proposals) as p(
    id uuid,
    drink_style text,
    drink_style_note text,
    bartender_tip text,
    presentation_tip text,
    es jsonb
  );

  if (select count(*) from pg_temp.proposed_notes) <> (select count(distinct id) from pg_temp.proposed_notes) then
    raise exception 'apply_recipe_notes: duplicate or missing recipe ids'
      using errcode = '22023';
  end if;

  select count(*) into bad_count
  from pg_temp.proposed_notes p
  left join public.recipes r on r.id = p.id and r.deleted_at is null
  where r.id is null
    or p.drink_style is null
    or p.drink_style not in (
      'sour', 'highball', 'spirit_forward', 'fizz_collins', 'tiki',
      'flip_cream', 'punch', 'shooter', 'hot', 'frozen', 'other'
    )
    or exists (
      select 1
      from (values
        (p.drink_style_note), (p.bartender_tip), (p.presentation_tip),
        (p.es_drink_style_note), (p.es_bartender_tip), (p.es_presentation_tip)
      ) v(t)
      where v.t is null or char_length(v.t) not between 1 and 240
    );

  if bad_count > 0 then
    raise exception 'apply_recipe_notes: % proposal(s) have an unknown or deleted id, a bad family, or a missing, blank, or too long text', bad_count
      using errcode = '22023';
  end if;

  update public.recipes r
  set drink_style = p.drink_style,
      drink_style_note = p.drink_style_note,
      bartender_tip = p.bartender_tip,
      presentation_tip = p.presentation_tip
  from pg_temp.proposed_notes p
  where r.id = p.id;

  update public.recipe_translations rt
  set drink_style_note = p.es_drink_style_note,
      bartender_tip = p.es_bartender_tip,
      presentation_tip = p.es_presentation_tip
  from pg_temp.proposed_notes p
  where rt.recipe_id = p.id
    and rt.locale = 'es';

  select coalesce(array_agg(p.id order by p.id), '{}'::uuid[]) into skipped
  from pg_temp.proposed_notes p
  where not exists (
    select 1 from public.recipe_translations rt
    where rt.recipe_id = p.id and rt.locale = 'es'
  );

  return skipped;
end;
$$;

revoke execute on function public.apply_recipe_notes(jsonb) from public, anon, authenticated;
grant execute on function public.apply_recipe_notes(jsonb) to service_role;

-- 3b. apply_ingredient_allergens --------------------------------------------

-- Writes reviewed allergen lists ({id, allergens}) to ingredients, deduped
-- and sorted. A null or non array list, a non string or unknown allergen, or
-- an unknown id rejects the whole payload (22023). An empty list is stored as
-- reviewed, none.
create or replace function public.apply_ingredient_allergens(proposals jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('apply_ingredient_allergens'));

  if proposals is null or jsonb_typeof(proposals) <> 'array' then
    raise exception 'apply_ingredient_allergens: proposals must be a JSON array'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(proposals) e
    where jsonb_typeof(e) <> 'object'
      or jsonb_typeof(e -> 'allergens') is distinct from 'array'
  ) then
    raise exception 'apply_ingredient_allergens: every proposal needs an allergens array (null is not allowed)'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(proposals) e
    cross join lateral jsonb_array_elements(e -> 'allergens') a
    where jsonb_typeof(a) <> 'string'
      or (a #>> '{}') not in (
        'egg', 'milk', 'tree_nuts', 'peanuts', 'gluten', 'soy',
        'sulfites', 'fish', 'shellfish', 'celery', 'sesame', 'mustard'
      )
  ) then
    raise exception 'apply_ingredient_allergens: unknown allergen in payload'
      using errcode = '22023';
  end if;

  create temporary table pg_temp.proposed_allergens on commit drop as
  select
    (e ->> 'id')::uuid as id,
    array(
      select distinct a
      from jsonb_array_elements_text(e -> 'allergens') a
      order by a
    ) as allergens
  from jsonb_array_elements(proposals) e;

  if exists (
    select 1 from pg_temp.proposed_allergens p
    left join public.ingredients i on i.id = p.id
    where i.id is null
  ) or (select count(*) from pg_temp.proposed_allergens) <> (select count(distinct id) from pg_temp.proposed_allergens) then
    raise exception 'apply_ingredient_allergens: unknown, missing, or duplicate ingredient id'
      using errcode = '22023';
  end if;

  update public.ingredients i
  set allergens = p.allergens
  from pg_temp.proposed_allergens p
  where i.id = p.id;
end;
$$;

revoke execute on function public.apply_ingredient_allergens(jsonb) from public, anon, authenticated;
grant execute on function public.apply_ingredient_allergens(jsonb) to service_role;

-- 4. admin_set_recipe_notes --------------------------------------------------

-- Sets the four English notes for one recipe. Blank input is stored as null.
-- Each English field that changes clears the matching Spanish field on every
-- recipe_translations row, so ES falls back to the new English (AC-10).
create or replace function public.admin_set_recipe_notes(
  p_recipe_id uuid,
  p_drink_style text,
  p_drink_style_note text,
  p_bartender_tip text,
  p_presentation_tip text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_style text := nullif(btrim(p_drink_style, E' \t\r\n'), '');
  v_note text := nullif(btrim(p_drink_style_note, E' \t\r\n'), '');
  v_bartender text := nullif(btrim(p_bartender_tip, E' \t\r\n'), '');
  v_presentation text := nullif(btrim(p_presentation_tip, E' \t\r\n'), '');
  current_row public.recipes%rowtype;
begin
  if not exists (
    select 1 from public.user_preferences up
    where up.user_id = auth.uid()
      and up.is_admin
  ) then
    raise exception 'not authorized';
  end if;

  if v_style is not null and v_style not in (
    'sour', 'highball', 'spirit_forward', 'fizz_collins', 'tiki',
    'flip_cream', 'punch', 'shooter', 'hot', 'frozen', 'other'
  ) then
    raise exception 'unknown drink style: %', v_style
      using errcode = '22023';
  end if;

  if v_note is not null and v_style is null then
    raise exception 'a style sentence needs a drink style'
      using errcode = '22023';
  end if;

  if char_length(v_note) > 240
    or char_length(v_bartender) > 240
    or char_length(v_presentation) > 240
  then
    raise exception 'style sentence and tips must be 240 characters or fewer'
      using errcode = '22023';
  end if;

  select * into current_row
  from public.recipes r
  where r.id = p_recipe_id
    and r.deleted_at is null
  for update;

  if not found then
    raise exception 'recipe not found: %', p_recipe_id;
  end if;

  update public.recipes
  set drink_style = v_style,
      drink_style_note = v_note,
      bartender_tip = v_bartender,
      presentation_tip = v_presentation
  where id = p_recipe_id;

  update public.recipe_translations rt
  set drink_style_note = case
        when v_note is distinct from current_row.drink_style_note then null
        else rt.drink_style_note
      end,
      bartender_tip = case
        when v_bartender is distinct from current_row.bartender_tip then null
        else rt.bartender_tip
      end,
      presentation_tip = case
        when v_presentation is distinct from current_row.presentation_tip then null
        else rt.presentation_tip
      end
  where rt.recipe_id = p_recipe_id
    and (
      v_note is distinct from current_row.drink_style_note
      or v_bartender is distinct from current_row.bartender_tip
      or v_presentation is distinct from current_row.presentation_tip
    );
end;
$$;

revoke all on function public.admin_set_recipe_notes(uuid, text, text, text, text) from public, anon;
grant execute on function public.admin_set_recipe_notes(uuid, text, text, text, text) to authenticated;

-- 4b. admin_set_ingredient_allergens ----------------------------------------

-- Sets one ingredient's reviewed allergen list (an empty list means reviewed,
-- none). Never writes null, so the app can't move a row back to not reviewed.
create or replace function public.admin_set_ingredient_allergens(
  p_ingredient_id uuid,
  p_allergens text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.user_preferences up
    where up.user_id = auth.uid()
      and up.is_admin
  ) then
    raise exception 'not authorized';
  end if;

  if p_allergens is null or array_position(p_allergens, null) is not null then
    raise exception 'allergens must be a list without nulls'
      using errcode = '22023';
  end if;

  if not (p_allergens <@ array[
    'egg', 'milk', 'tree_nuts', 'peanuts', 'gluten', 'soy',
    'sulfites', 'fish', 'shellfish', 'celery', 'sesame', 'mustard'
  ]::text[]) then
    raise exception 'unknown allergen in %', p_allergens
      using errcode = '22023';
  end if;

  update public.ingredients
  set allergens = array(select distinct a from unnest(p_allergens) a order by a)
  where id = p_ingredient_id;

  if not found then
    raise exception 'ingredient not found: %', p_ingredient_id;
  end if;
end;
$$;

revoke all on function public.admin_set_ingredient_allergens(uuid, text[]) from public, anon;
grant execute on function public.admin_set_ingredient_allergens(uuid, text[]) to authenticated;
