-- Spec 0064 (user submitted recipes), migration slice 1: the thread.
--
-- recipe_submissions and recipe_submission_usage, recipes.source 'community'
-- plus recipes.submitted_by, user_preferences.submissions_blocked_at,
-- _upsert_recipe_core (admin_upsert_recipe refactored onto it with no
-- behavior change), the author functions, the admin list, fetch and approve
-- functions, and fetch_recipe_detail with submitted_by_name and is_community.
--
-- Every function here is security definer with search_path = '' and raises
-- an explicit code as its message (errcode P0001) that
-- packages/shared/src/submissions maps to a typed result.
--
-- Applied by hand in the dashboard SQL editor. Rollback:
-- supabase/rollbacks/20261122120000_user_submitted_recipes_down.sql.
-- Checks: supabase/tests/recipe_submissions_check.sql.

begin;

-- 1. recipes: community source and the author credit -------------------------
alter table public.recipes drop constraint recipes_source_check;
alter table public.recipes
  add constraint recipes_source_check check (source in ('catalog', 'admin', 'community'));

alter table public.recipes
  add column submitted_by uuid null references auth.users (id) on delete set null;

alter table public.recipes
  add constraint recipes_submitted_by_community_check
  check (submitted_by is null or source = 'community');

create index recipes_submitted_by_idx
  on public.recipes (submitted_by)
  where submitted_by is not null;

-- 2. user_preferences: block from submitting (AC-18) -------------------------
-- Not added to the authenticated column update grant, so an author can never
-- clear it; only the admin function (task 10) writes it.
alter table public.user_preferences
  add column submissions_blocked_at timestamptz null;

-- 3. recipe_submissions -------------------------------------------------------
create function public.recipe_submission_ingredients_valid(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    case
      when jsonb_typeof(p) is distinct from 'array' then false
      when jsonb_array_length(p) not between 1 and 20 then false
      else not exists (
        select 1
        from jsonb_array_elements(p) as e
        -- CASE, not OR: SQL does not promise short circuit evaluation, and
        -- jsonb_object_keys fails on anything but an object.
        where case
          when jsonb_typeof(e) <> 'object' then true
          when exists (
            select 1 from jsonb_object_keys(e) k where k not in ('name', 'measure')
          ) then true
          when jsonb_typeof(e -> 'name') is distinct from 'string' then true
          when char_length(e ->> 'name') not between 1 and 80 then true
          when (e ->> 'name') <> btrim(e ->> 'name', E' \t\r\n') then true
          when coalesce(jsonb_typeof(e -> 'measure'), 'null') = 'null' then false
          when jsonb_typeof(e -> 'measure') <> 'string' then true
          when char_length(e ->> 'measure') not between 1 and 50 then true
          else (e ->> 'measure') <> btrim(e ->> 'measure', E' \t\r\n')
        end
      )
    end,
    false
  );
$$;

-- Trims names and measures, turns a blank measure into null, and keeps order.
-- The result still goes through recipe_submission_ingredients_valid.
create function public.normalize_recipe_submission_ingredients(p jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p) is distinct from 'array' then null
    else (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'name', nullif(btrim(coalesce(e ->> 'name', ''), E' \t\r\n'), ''),
            'measure', nullif(btrim(coalesce(e ->> 'measure', ''), E' \t\r\n'), '')
          )
          order by ord
        ),
        '[]'::jsonb
      )
      from jsonb_array_elements(p) with ordinality as x(e, ord)
    )
  end;
$$;

create table public.recipe_submissions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('pending', 'approved', 'rejected')),
  locale text not null references public.supported_locales (code),
  name text not null
    check (name = btrim(name, E' \t\r\n') and char_length(name) between 1 and 100),
  instructions text not null
    check (instructions = btrim(instructions, E' \t\r\n') and char_length(instructions) between 1 and 2000),
  ingredients jsonb not null
    check (public.recipe_submission_ingredients_valid(ingredients)),
  glass text null
    check (glass is null or (glass = btrim(glass, E' \t\r\n') and char_length(glass) between 1 and 100)),
  alcoholic_status text not null
    check (alcoholic_status in ('alcoholic', 'non_alcoholic', 'optional', 'unknown')),
  note text null
    check (note is null or (note = btrim(note, E' \t\r\n') and char_length(note) between 1 and 300)),
  photo_path text null
    check (photo_path is null or photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}-[0-9a-f]{16}$'),
  text_screening text not null default 'pending'
    check (text_screening in ('pending', 'clear', 'flagged', 'error', 'skipped')),
  photo_screening text null
    check (photo_screening is null or photo_screening in ('pending', 'clear', 'flagged', 'error', 'skipped')),
  screening_note text null check (screening_note is null or char_length(screening_note) <= 300),
  screening_attempts smallint not null default 0,
  screening_claimed_at timestamptz null,
  rejection_reason text null
    check (rejection_reason is null or char_length(rejection_reason) between 1 and 500),
  approved_recipe_id uuid null references public.recipes (id) on delete set null,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipe_submissions_photo_screening_pair_check
    check ((photo_path is null) = (photo_screening is null)),
  -- Not "_rejection_reason_check": Postgres already gives that name to the
  -- column's own length check above.
  constraint recipe_submissions_rejection_reason_status_check
    check ((status = 'rejected') = (rejection_reason is not null)),
  constraint recipe_submissions_approved_recipe_check
    check (approved_recipe_id is null or status = 'approved')
);

create index recipe_submissions_pending_queue_idx
  on public.recipe_submissions (status, submitted_at, id);
create index recipe_submissions_reviewed_queue_idx
  on public.recipe_submissions (status, reviewed_at desc, id desc);
create index recipe_submissions_author_idx
  on public.recipe_submissions (author_id, submitted_at desc);
create index recipe_submissions_unscreened_idx
  on public.recipe_submissions (submitted_at)
  where text_screening = 'pending';
create index recipe_submissions_rejected_retention_idx
  on public.recipe_submissions (reviewed_at)
  where status = 'rejected';
create index recipe_submissions_approved_recipe_idx
  on public.recipe_submissions (approved_recipe_id)
  where approved_recipe_id is not null;

-- updated_at is the AC-14 concurrency token, so it moves only when the author
-- or the admin changes the submission, never on a screening write (task 8).
create function public.recipe_submissions_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    new.status, new.name, new.instructions, new.ingredients, new.glass,
    new.alcoholic_status, new.note, new.photo_path, new.rejection_reason,
    new.approved_recipe_id, new.submitted_at, new.reviewed_at
  ) is distinct from (
    old.status, old.name, old.instructions, old.ingredients, old.glass,
    old.alcoholic_status, old.note, old.photo_path, old.rejection_reason,
    old.approved_recipe_id, old.submitted_at, old.reviewed_at
  ) then
    new.updated_at := clock_timestamp();
  end if;
  return new;
end;
$$;

create trigger recipe_submissions_touch_updated_at
  before update on public.recipe_submissions
  for each row execute function public.recipe_submissions_touch_updated_at();

alter table public.recipe_submissions enable row level security;
revoke all on table public.recipe_submissions from anon, authenticated;
grant select on table public.recipe_submissions to authenticated;

-- AC-23: only the admin selects; nobody writes directly.
create policy recipe_submissions_admin_select
  on public.recipe_submissions
  for select
  to authenticated
  using ((select public.is_current_user_admin()));

-- 4. recipe_submission_usage (AC-5 daily cap) ---------------------------------
create table public.recipe_submission_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count int not null check (count >= 0),
  primary key (user_id, day)
);

alter table public.recipe_submission_usage enable row level security;
revoke all on table public.recipe_submission_usage from anon, authenticated;

-- 5. _upsert_recipe_core and admin_upsert_recipe ------------------------------
-- The body of admin_upsert_recipe (20261114190000_fame_on_arrival.sql) moved
-- here unchanged, minus the admin check, plus p_source, p_source_id,
-- p_submitted_by (used on insert only) and p_new_recipe_id (the id an insert
-- takes, so the approval's photo path is known before the row exists).
-- An update never changes source, source_id, or submitted_by (AC-22).
create function public._upsert_recipe_core(
  p_source text,
  p_source_id text,
  p_submitted_by uuid,
  p_new_recipe_id uuid,
  p_recipe_id uuid,
  p_name text,
  p_instructions text,
  p_glass text,
  p_alcoholic_status text,
  p_region text,
  p_ingredients jsonb,
  p_tags jsonb,
  p_flavor_profile text[],
  p_set_method boolean,
  p_method text,
  p_set_fame_score boolean,
  p_fame_score smallint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipe_row_id uuid;
  ingredient jsonb;
  tag jsonb;
  flavor text;
  ingredient_row_id uuid;
  tag_row_id uuid;
  tag_row_kind text;
  ingredient_count int;
  stored public.recipes%rowtype;
  stored_ingredients jsonb;
  input_ingredients jsonb;
  stored_tags text[];
  input_tags text[];
  import_owned_changed boolean;
  old_region text;
  old_fame_score smallint;
  rank_changed boolean;
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'name is required';
  end if;

  if length(p_name) > 200 then
    raise exception 'name must be 200 characters or fewer';
  end if;

  if p_instructions is null or btrim(p_instructions) = '' then
    raise exception 'instructions are required';
  end if;

  if length(p_instructions) > 10000 then
    raise exception 'instructions must be 10,000 characters or fewer';
  end if;

  if p_alcoholic_status is null
    or p_alcoholic_status not in ('alcoholic', 'non_alcoholic', 'optional', 'unknown')
  then
    raise exception 'alcoholic_status must be one of alcoholic, non_alcoholic, optional, unknown';
  end if;

  select coalesce(jsonb_array_length(p_ingredients), 0) into ingredient_count;

  if ingredient_count = 0 then
    raise exception 'at least one ingredient is required';
  end if;

  if p_flavor_profile is not null then
    foreach flavor in array p_flavor_profile
    loop
      if length(btrim(flavor)) > 50 then
        raise exception 'flavor must be 50 characters or fewer: %', flavor;
      end if;
    end loop;
  end if;

  -- recipes_method_check also rejects an unknown method; this gives the
  -- admin form a readable message first.
  if p_set_method
    and p_method is not null
    and p_method not in ('shake', 'stir', 'build', 'blend', 'layer')
  then
    raise exception 'method must be one of shake, stir, build, blend, layer';
  end if;

  -- Spec 0056 AC-10: a whole number from 0 to 100, or null (the next import
  -- scores it). smallint already rules out fractions.
  if p_set_fame_score
    and p_fame_score is not null
    and (p_fame_score < 0 or p_fame_score > 100)
  then
    raise exception 'fame score must be a whole number from 0 to 100';
  end if;

  perform pg_advisory_xact_lock(hashtext('admin_upsert_recipe'));

  if p_recipe_id is null then
    insert into public.recipes (
      id, source_id, source, submitted_by, name, instructions, glass, alcoholic_status, region, fame_score
    )
    values (
      coalesce(p_new_recipe_id, gen_random_uuid()),
      coalesce(p_source_id, 'admin-' || gen_random_uuid()::text),
      p_source,
      p_submitted_by,
      p_name,
      p_instructions,
      p_glass,
      p_alcoholic_status,
      p_region,
      case when p_set_fame_score then p_fame_score end
    )
    returning id into recipe_row_id;

    rank_changed := p_region is not null
      or (p_set_fame_score and p_fame_score is not null);
  else
    -- Spec 0056 AC-1: read the stored row under the row lock before any
    -- write, so the comparison never sees content an import is changing.
    select * into stored
    from public.recipes r
    where r.id = p_recipe_id
    for update;

    if not found then
      raise exception 'recipe not found: %', p_recipe_id;
    end if;

    -- AC-10: the old region is read before the write, so both the region a
    -- recipe leaves and the one it joins are reranked.
    old_region := stored.region;
    old_fame_score := stored.fame_score;
    rank_changed := p_region is distinct from old_region
      or (p_set_fame_score and p_fame_score is distinct from old_fame_score);

    if stored.source = 'catalog' and stored.admin_locked_at is null then
      -- Each side is normalized the way the form normalizes before sending:
      -- ingredient names to ingredients.normalized_name, measures trimmed
      -- with blank as null, list order by position (the import numbers from
      -- 1, the form from 0), glass by lower(btrim()), tags as a set.
      select coalesce(
        jsonb_agg(
          jsonb_build_array(
            i.normalized_name,
            nullif(btrim(ri.measure), ''),
            ri.amount_value,
            ri.amount_max_value,
            ri.amount_unit
          )
          order by ri.sort_order, i.normalized_name
        ),
        '[]'::jsonb
      )
      into stored_ingredients
      from public.recipe_ingredients ri
      join public.ingredients i on i.id = ri.ingredient_id
      where ri.recipe_id = p_recipe_id;

      select coalesce(
        jsonb_agg(
          jsonb_build_array(
            lower(btrim(regexp_replace(e ->> 'name', '\s+', ' ', 'g'))),
            nullif(btrim(e ->> 'measure'), ''),
            (e ->> 'amount_value')::numeric,
            (e ->> 'amount_max_value')::numeric,
            e ->> 'amount_unit'
          )
          order by ord
        ),
        '[]'::jsonb
      )
      into input_ingredients
      from jsonb_array_elements(p_ingredients) with ordinality as x(e, ord);

      select coalesce(array_agg(t.normalized_name order by t.normalized_name), '{}')
      into stored_tags
      from public.recipe_tags rtags
      join public.tags t on t.id = rtags.tag_id and t.kind = 'catalog'
      where rtags.recipe_id = p_recipe_id;

      -- A name that matches an existing taste tag is skipped by the tag loop
      -- below, so it is no catalog tag change either.
      select coalesce(array_agg(n order by n), '{}')
      into input_tags
      from (
        select distinct lower(btrim(regexp_replace(e ->> 'name', '\s+', ' ', 'g'))) as n
        from jsonb_array_elements(coalesce(p_tags, '[]'::jsonb)) as e
        where nullif(btrim(e ->> 'name'), '') is not null
      ) names
      where not exists (
        select 1 from public.tags t
        where t.normalized_name = names.n and t.kind <> 'catalog'
      );

      import_owned_changed :=
        btrim(stored.name) is distinct from btrim(p_name)
        or nullif(lower(btrim(stored.glass)), '') is distinct from nullif(lower(btrim(p_glass)), '')
        or stored.alcoholic_status is distinct from p_alcoholic_status
        or (
          stored.source_id ~ '^custom:'
          and btrim(stored.instructions) is distinct from btrim(p_instructions)
        )
        or stored_ingredients is distinct from input_ingredients
        or stored_tags is distinct from input_tags;
    else
      import_owned_changed := false;
    end if;

    update public.recipes
    set name = p_name,
        instructions = p_instructions,
        glass = p_glass,
        alcoholic_status = p_alcoholic_status,
        region = p_region,
        fame_score = case when p_set_fame_score then p_fame_score else fame_score end,
        -- Cleared here so moving regions never collides with a rank already
        -- held in the new region; recompute_popularity_ranks sets it again.
        popularity_rank = case when rank_changed then null else popularity_rank end,
        admin_locked_at = case
          when import_owned_changed then now()
          else admin_locked_at
        end,
        -- AC-5: any save of a row that is locked after this save acknowledges
        -- the latest upstream version.
        source_hash = case
          when admin_locked_at is not null or import_owned_changed then latest_source_hash
          else source_hash
        end,
        updated_at = now()
    where id = p_recipe_id
    returning id into recipe_row_id;
  end if;

  delete from public.recipe_ingredients where recipe_id = recipe_row_id;

  delete from public.recipe_tags rtags
  using public.tags t
  where rtags.recipe_id = recipe_row_id
    and t.id = rtags.tag_id
    and t.kind = 'catalog';

  for ingredient in select * from jsonb_array_elements(p_ingredients)
  loop
    if (ingredient ->> 'name') is null or btrim(ingredient ->> 'name') = '' then
      raise exception 'ingredient name is required';
    end if;

    insert into public.ingredients (name)
    values (ingredient ->> 'name')
    on conflict (normalized_name) do update
    set name = excluded.name
    returning id into ingredient_row_id;

    -- recipe_ingredients_amount_unit_check and _amount_pair_check reject an
    -- unknown unit or a half set pair, and _amount_max_check rejects a max
    -- that is not above the value, failing the whole save atomically.
    insert into public.recipe_ingredients (
      recipe_id, ingredient_id, measure, sort_order, amount_value, amount_max_value, amount_unit
    )
    values (
      recipe_row_id,
      ingredient_row_id,
      ingredient ->> 'measure',
      (ingredient -> 'sortOrder')::int,
      (ingredient ->> 'amount_value')::numeric,
      (ingredient ->> 'amount_max_value')::numeric,
      ingredient ->> 'amount_unit'
    )
    on conflict (recipe_id, ingredient_id) do nothing;
  end loop;

  for tag in select * from jsonb_array_elements(coalesce(p_tags, '[]'::jsonb))
  loop
    if (tag ->> 'name') is null or btrim(tag ->> 'name') = '' then
      continue;
    end if;

    insert into public.tags (name)
    values (tag ->> 'name')
    on conflict (normalized_name) do update
    set name = excluded.name
    returning id, kind into tag_row_id, tag_row_kind;

    -- Flavor profile is managed only through p_flavor_profile.
    if tag_row_kind <> 'catalog' then
      continue;
    end if;

    insert into public.recipe_tags (recipe_id, tag_id)
    values (recipe_row_id, tag_row_id)
    on conflict (recipe_id, tag_id) do nothing;
  end loop;

  if p_flavor_profile is not null then
    delete from public.recipe_tags rtags
    using public.tags t
    where rtags.recipe_id = recipe_row_id
      and t.id = rtags.tag_id
      and t.kind = 'taste';

    foreach flavor in array p_flavor_profile
    loop
      if flavor is null or btrim(flavor) = '' then
        continue;
      end if;

      -- A new flavor becomes a new taste tag. An existing taste tag keeps its
      -- stored spelling. A catalog tag of the same name is promoted to taste
      -- (names are unique across kinds), as the vocabulary seed did for
      -- Fruity and Refreshing.
      insert into public.tags (name, kind)
      values (btrim(flavor), 'taste')
      on conflict (normalized_name) do update
      set kind = 'taste'
      returning id into tag_row_id;

      insert into public.recipe_tags (recipe_id, tag_id)
      values (recipe_row_id, tag_row_id)
      on conflict (recipe_id, tag_id) do nothing;
    end loop;

    update public.recipes
    set flavor_profile_locked = true
    where id = recipe_row_id;
  end if;

  -- Spec 0054 AC-11: only when the caller asks. A chosen method is an admin
  -- pick the classifier never overwrites; blank clears both columns, leaving
  -- the recipe free for the classifier's next run.
  if p_set_method then
    update public.recipes
    set method = p_method,
        method_source = case when p_method is null then null else 'admin' end
    where id = recipe_row_id;
  end if;

  if rank_changed then
    perform public.recompute_popularity_ranks(array_remove(array[old_region, p_region], null));
  end if;

  return recipe_row_id;
end;
$$;

-- Internal: only other definer functions call it.
revoke all on function public._upsert_recipe_core(
  text, text, uuid, uuid, uuid, text, text, text, text, text, jsonb, jsonb, text[], boolean, text, boolean, smallint
) from public, anon, authenticated;

-- Same signature and return type, so create or replace keeps its grants.
create or replace function public.admin_upsert_recipe(
  p_recipe_id uuid,
  p_name text,
  p_instructions text,
  p_glass text,
  p_alcoholic_status text,
  p_region text,
  p_ingredients jsonb,
  p_tags jsonb,
  p_flavor_profile text[] default null,
  p_set_method boolean default false,
  p_method text default null,
  p_set_fame_score boolean default false,
  p_fame_score smallint default null
)
returns uuid
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

  return public._upsert_recipe_core(
    'admin', null, null, null,
    p_recipe_id, p_name, p_instructions, p_glass, p_alcoholic_status, p_region,
    p_ingredients, p_tags, p_flavor_profile, p_set_method, p_method,
    p_set_fame_score, p_fame_score
  );
end;
$$;

revoke all on function public.admin_upsert_recipe(
  uuid, text, text, text, text, text, jsonb, jsonb, text[], boolean, text, boolean, smallint
) from public, anon;

grant execute on function public.admin_upsert_recipe(
  uuid, text, text, text, text, text, jsonb, jsonb, text[], boolean, text, boolean, smallint
) to authenticated;

-- 6. save_recipe_submission (AC-1 to AC-5, AC-6 edit path) --------------------
create function public.save_recipe_submission(
  p_id uuid,
  p_name text,
  p_ingredients jsonb,
  p_instructions text,
  p_glass text,
  p_alcoholic_status text,
  p_note text default null,
  p_photo_path text default null,
  p_locale text default 'en',
  p_display_name text default null
)
returns table (id uuid, status text, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  v_name text;
  v_instructions text;
  v_glass text;
  v_note text;
  v_display_name text;
  v_ingredients jsonb;
  existing public.recipe_submissions%rowtype;
  is_edit boolean;
  current_display_name text;
  blocked_at timestamptz;
  pending_count int;
  used_today int;
  today date := (now() at time zone 'utc')::date;
begin
  if uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = 'P0001', message = 'anonymous';
  end if;

  if p_id is null then
    raise exception using errcode = 'P0001', message = 'not_editable';
  end if;

  -- Invariant 4: caps hold under concurrent saves by the same user.
  perform pg_advisory_xact_lock(hashtext('recipe_submission:' || uid::text));

  select up.display_name, up.submissions_blocked_at
  into current_display_name, blocked_at
  from public.user_preferences up
  where up.user_id = uid;

  if blocked_at is not null then
    raise exception using errcode = 'P0001', message = 'blocked';
  end if;

  select * into existing
  from public.recipe_submissions s
  where s.id = p_id
  for update;

  is_edit := found;

  -- Invariant 10: another user's id and an approved row look the same.
  if is_edit and (existing.author_id <> uid or existing.status = 'approved') then
    raise exception using errcode = 'P0001', message = 'not_editable';
  end if;

  v_name := nullif(btrim(coalesce(p_name, ''), E' \t\r\n'), '');
  if v_name is null or char_length(v_name) > 100 then
    raise exception using errcode = 'P0001', message = 'invalid_name';
  end if;

  v_ingredients := public.normalize_recipe_submission_ingredients(p_ingredients);
  if not public.recipe_submission_ingredients_valid(v_ingredients) then
    raise exception using errcode = 'P0001', message = 'invalid_ingredients';
  end if;

  v_instructions := nullif(btrim(coalesce(p_instructions, ''), E' \t\r\n'), '');
  if v_instructions is null or char_length(v_instructions) > 2000 then
    raise exception using errcode = 'P0001', message = 'invalid_instructions';
  end if;

  v_glass := nullif(btrim(coalesce(p_glass, ''), E' \t\r\n'), '');
  if v_glass is not null and char_length(v_glass) > 100 then
    raise exception using errcode = 'P0001', message = 'invalid_glass';
  end if;

  if p_alcoholic_status is null
    or p_alcoholic_status not in ('alcoholic', 'non_alcoholic', 'optional', 'unknown')
  then
    raise exception using errcode = 'P0001', message = 'invalid_alcoholic_status';
  end if;

  v_note := nullif(btrim(coalesce(p_note, ''), E' \t\r\n'), '');
  if v_note is not null and char_length(v_note) > 300 then
    raise exception using errcode = 'P0001', message = 'invalid_note';
  end if;

  if p_photo_path is not null
    and p_photo_path !~ ('^' || uid::text || '/' || p_id::text || '-[0-9a-f]{16}$')
  then
    raise exception using errcode = 'P0001', message = 'invalid_photo';
  end if;

  if not is_edit and not exists (
    select 1 from public.supported_locales sl where sl.code = p_locale
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_locale';
  end if;

  -- AC-3: a display name is required once, saved with the submission.
  if current_display_name is null then
    v_display_name := nullif(btrim(coalesce(p_display_name, '')), '');
    if v_display_name is null then
      raise exception using errcode = 'P0001', message = 'display_name_required';
    end if;
    if char_length(v_display_name) > 50 then
      raise exception using errcode = 'P0001', message = 'invalid_display_name';
    end if;
  end if;

  -- AC-5: editing one of five pending rows still works (id <> p_id).
  select count(*) into pending_count
  from public.recipe_submissions s
  where s.author_id = uid
    and s.status = 'pending'
    and s.id <> p_id;

  if pending_count >= 5 then
    raise exception using errcode = 'P0001', message = 'pending_cap';
  end if;

  select u.count into used_today
  from public.recipe_submission_usage u
  where u.user_id = uid and u.day = today;

  if coalesce(used_today, 0) >= 10 then
    raise exception using errcode = 'P0001', message = 'daily_cap';
  end if;

  insert into public.recipe_submission_usage as u (user_id, day, count)
  values (uid, today, 1)
  on conflict (user_id, day) do update set count = u.count + 1;

  if v_display_name is not null then
    insert into public.user_preferences as up (user_id, display_name)
    values (uid, v_display_name)
    on conflict (user_id) do update set display_name = excluded.display_name;
  end if;

  if is_edit then
    -- AC-6: back to pending, reason cleared, new submitted_at, new screening.
    -- locale never changes on edit.
    update public.recipe_submissions s
    set status = 'pending',
        name = v_name,
        instructions = v_instructions,
        ingredients = v_ingredients,
        glass = v_glass,
        alcoholic_status = p_alcoholic_status,
        note = v_note,
        photo_path = p_photo_path,
        text_screening = 'pending',
        photo_screening = case when p_photo_path is null then null else 'pending' end,
        screening_note = null,
        screening_attempts = 0,
        screening_claimed_at = null,
        rejection_reason = null,
        reviewed_at = null,
        submitted_at = clock_timestamp()
    where s.id = p_id;
  else
    insert into public.recipe_submissions (
      id, author_id, status, locale, name, instructions, ingredients, glass,
      alcoholic_status, note, photo_path, photo_screening, submitted_at
    )
    values (
      p_id, uid, 'pending', p_locale, v_name, v_instructions, v_ingredients, v_glass,
      p_alcoholic_status, v_note, p_photo_path,
      case when p_photo_path is null then null else 'pending' end,
      clock_timestamp()
    );
  end if;

  return query
  select s.id, s.status, s.updated_at
  from public.recipe_submissions s
  where s.id = p_id;
end;
$$;

-- 7. Author reads (never screening fields, AC-23) ----------------------------
create function public.fetch_my_recipe_submissions(
  p_cursor_submitted_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit int default 20,
  p_locale text default 'en'
)
returns table (
  id uuid,
  status text,
  name text,
  photo_path text,
  rejection_reason text,
  approved_recipe_id uuid,
  recipe_name text,
  recipe_base_name text,
  recipe_image_url text,
  recipe_removed boolean,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.status,
    s.name,
    case when s.status = 'approved' then null else s.photo_path end,
    s.rejection_reason,
    s.approved_recipe_id,
    case when r.deleted_at is null then coalesce(rt.name, r.name) end,
    case when r.deleted_at is null then r.name end,
    case when r.deleted_at is null then r.image_url end,
    s.status = 'approved' and (r.id is null or r.deleted_at is not null),
    s.submitted_at,
    s.reviewed_at,
    s.updated_at
  from public.recipe_submissions s
  left join public.recipes r on r.id = s.approved_recipe_id
  left join public.recipe_translations rt
    on rt.recipe_id = r.id and rt.locale = public.resolve_locale(p_locale)
  where s.author_id = (select auth.uid())
    and (
      p_cursor_submitted_at is null
      or (s.submitted_at, s.id) < (p_cursor_submitted_at, coalesce(p_cursor_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
    )
  order by s.submitted_at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- With p_id null it returns one row holding only needs_display_name and
-- blocked, which the new submission form reads before the first save.
create function public.fetch_my_recipe_submission(p_id uuid default null)
returns table (
  id uuid,
  status text,
  locale text,
  name text,
  instructions text,
  ingredients jsonb,
  glass text,
  alcoholic_status text,
  note text,
  photo_path text,
  rejection_reason text,
  approved_recipe_id uuid,
  updated_at timestamptz,
  needs_display_name boolean,
  blocked boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  v_needs_display_name boolean;
  v_blocked boolean;
begin
  if uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = 'P0001', message = 'anonymous';
  end if;

  select
    coalesce(bool_or(up.display_name is null), true),
    coalesce(bool_or(up.submissions_blocked_at is not null), false)
  into v_needs_display_name, v_blocked
  from public.user_preferences up
  where up.user_id = uid;

  if p_id is null then
    return query
    select
      null::uuid, null::text, null::text, null::text, null::text, null::jsonb,
      null::text, null::text, null::text, null::text, null::text, null::uuid,
      null::timestamptz, v_needs_display_name, v_blocked;
    return;
  end if;

  return query
  select
    s.id, s.status, s.locale, s.name, s.instructions, s.ingredients, s.glass,
    s.alcoholic_status, s.note,
    case when s.status = 'approved' then null else s.photo_path end,
    s.rejection_reason, s.approved_recipe_id, s.updated_at,
    v_needs_display_name, v_blocked
  from public.recipe_submissions s
  where s.id = p_id and s.author_id = uid;

  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
end;
$$;

-- 8. Admin list and fetch (AC-10, AC-11) --------------------------------------
create function public.admin_list_recipe_submissions(
  p_status text,
  p_cursor_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit int default 25
)
returns table (
  id uuid,
  name text,
  author_id uuid,
  author_display_name text,
  locale text,
  photo_path text,
  text_screening text,
  photo_screening text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  page_size int := least(greatest(coalesce(p_limit, 25), 1), 100);
begin
  if not public.is_current_user_admin() then
    raise exception using errcode = 'P0001', message = 'not_admin';
  end if;

  if p_status is null or p_status not in ('pending', 'approved', 'rejected') then
    raise exception using errcode = 'P0001', message = 'invalid_status';
  end if;

  if p_status = 'pending' then
    -- Oldest first.
    return query
    select s.id, s.name, s.author_id, up.display_name, s.locale, s.photo_path,
           s.text_screening, s.photo_screening, s.submitted_at, s.reviewed_at, s.updated_at
    from public.recipe_submissions s
    left join public.user_preferences up on up.user_id = s.author_id
    where s.status = 'pending'
      and (
        p_cursor_at is null
        or (s.submitted_at, s.id) > (p_cursor_at, coalesce(p_cursor_id, '00000000-0000-0000-0000-000000000000'::uuid))
      )
    order by s.submitted_at asc, s.id asc
    limit page_size;
  else
    -- Newest review first.
    return query
    select s.id, s.name, s.author_id, up.display_name, s.locale, s.photo_path,
           s.text_screening, s.photo_screening, s.submitted_at, s.reviewed_at, s.updated_at
    from public.recipe_submissions s
    left join public.user_preferences up on up.user_id = s.author_id
    where s.status = p_status
      and (
        p_cursor_at is null
        or (s.reviewed_at, s.id) < (p_cursor_at, coalesce(p_cursor_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
      )
    order by s.reviewed_at desc, s.id desc
    limit page_size;
  end if;
end;
$$;

create function public.admin_fetch_recipe_submission(p_id uuid)
returns table (
  id uuid,
  author_id uuid,
  status text,
  locale text,
  name text,
  instructions text,
  ingredients jsonb,
  glass text,
  alcoholic_status text,
  note text,
  photo_path text,
  text_screening text,
  photo_screening text,
  screening_note text,
  screening_attempts smallint,
  rejection_reason text,
  approved_recipe_id uuid,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  author_display_name text,
  author_blocked boolean,
  similar_recipes jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_current_user_admin() then
    raise exception using errcode = 'P0001', message = 'not_admin';
  end if;

  return query
  select
    s.id, s.author_id, s.status, s.locale, s.name, s.instructions, s.ingredients,
    s.glass, s.alcoholic_status, s.note, s.photo_path, s.text_screening,
    s.photo_screening, s.screening_note, s.screening_attempts, s.rejection_reason,
    s.approved_recipe_id, s.submitted_at, s.reviewed_at, s.created_at, s.updated_at,
    up.display_name,
    coalesce(up.submissions_blocked_at is not null, false),
    coalesce(
      (
        select jsonb_agg(jsonb_build_object('id', sr.id, 'name', sr.name, 'base_name', sr.base_name))
        from public.search_recipes(s.name, null, 5, 0, 'en', 'popular', false) sr
      ),
      '[]'::jsonb
    )
  from public.recipe_submissions s
  left join public.user_preferences up on up.user_id = s.author_id
  where s.id = p_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
end;
$$;

-- 9. admin_approve_recipe_submission (AC-11, AC-14) ---------------------------
create function public.admin_approve_recipe_submission(
  p_submission_id uuid,
  p_expected_updated_at timestamptz,
  p_recipe_id uuid,
  p_name text,
  p_instructions text,
  p_glass text,
  p_alcoholic_status text,
  p_region text,
  p_ingredients jsonb,
  p_tags jsonb,
  p_flavor_profile text[] default null,
  p_set_method boolean default false,
  p_method text default null,
  p_set_fame_score boolean default false,
  p_fame_score smallint default null,
  p_bartender_tip text default null,
  p_image_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sub public.recipe_submissions%rowtype;
  v_tip text;
  new_recipe_id uuid;
begin
  if not public.is_current_user_admin() then
    raise exception using errcode = 'P0001', message = 'not_admin';
  end if;

  if p_recipe_id is null then
    raise exception using errcode = 'P0001', message = 'invalid_recipe_id';
  end if;

  select * into sub
  from public.recipe_submissions s
  where s.id = p_submission_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  if sub.status <> 'pending' or sub.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'stale';
  end if;

  -- recipes_bartender_tip_check: trimmed, 1 to 240 characters.
  v_tip := nullif(btrim(coalesce(p_bartender_tip, ''), E' \t\r\n'), '');
  if v_tip is not null and char_length(v_tip) > 240 then
    raise exception using errcode = 'P0001', message = 'invalid_bartender_tip';
  end if;

  new_recipe_id := public._upsert_recipe_core(
    'community', 'community-' || sub.id::text, sub.author_id, p_recipe_id,
    null, p_name, p_instructions, p_glass, p_alcoholic_status, p_region,
    p_ingredients, p_tags, p_flavor_profile, p_set_method, p_method,
    p_set_fame_score, p_fame_score
  );

  update public.recipes
  set bartender_tip = v_tip,
      image_url = coalesce(p_image_url, image_url),
      image_origin = case when p_image_url is not null then 'admin_upload' else image_origin end
  where id = new_recipe_id;

  update public.recipe_submissions s
  set status = 'approved',
      approved_recipe_id = new_recipe_id,
      reviewed_at = clock_timestamp()
  where s.id = sub.id;

  return new_recipe_id;
end;
$$;

-- 10. Public credit (AC-16) ---------------------------------------------------
-- user_preferences is readable only by its owner, so the live display name of
-- a community recipe's author comes through this definer helper. It takes a
-- recipe id, never a user id, so it only reveals names already shown as
-- credit on a public page.
create function public.recipe_submitted_by_name(p_recipe_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select up.display_name
  from public.recipes r
  join public.user_preferences up on up.user_id = r.submitted_by
  where r.id = p_recipe_id
    and r.source = 'community';
$$;

drop function public.fetch_recipe_detail(uuid, text);

create function public.fetch_recipe_detail(p_id uuid, p_locale text default 'en'::text)
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
  presentation_tip text,
  base_name text,
  mocktail_safe boolean,
  submitted_by_name text,
  is_community boolean
)
language sql
stable
set search_path = ''
as $$
  with resolved_locale as (
    select public.resolve_locale(p_locale) as locale
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
            'amount_max_value', ri.amount_max_value,
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
    coalesce(rt.presentation_tip, r.presentation_tip) as presentation_tip,
    r.name as base_name,
    -- Spec 0063 AC-6: the one definition of mocktail safe, from the view.
    r.id in (select ms.id from public.mocktail_safe_recipes ms) as mocktail_safe,
    -- Spec 0064 AC-16: read live, null once the account is deleted.
    case when r.source = 'community' then public.recipe_submitted_by_name(r.id) end as submitted_by_name,
    r.source = 'community' as is_community
  from public.recipes r
  left join public.recipe_translations rt
    on rt.recipe_id = r.id and rt.locale = (select locale from resolved_locale)
  where r.id = p_id
    and r.deleted_at is null;
$$;

-- 11. Grants ------------------------------------------------------------------
revoke all on function public.recipe_submission_ingredients_valid(jsonb) from public, anon;
grant execute on function public.recipe_submission_ingredients_valid(jsonb) to authenticated, service_role;
revoke all on function public.normalize_recipe_submission_ingredients(jsonb) from public, anon;
grant execute on function public.normalize_recipe_submission_ingredients(jsonb) to authenticated, service_role;
revoke all on function public.recipe_submissions_touch_updated_at() from public, anon, authenticated;

revoke all on function public.save_recipe_submission(
  uuid, text, jsonb, text, text, text, text, text, text, text
) from public, anon;
grant execute on function public.save_recipe_submission(
  uuid, text, jsonb, text, text, text, text, text, text, text
) to authenticated;

revoke all on function public.fetch_my_recipe_submissions(timestamptz, uuid, int, text) from public, anon;
grant execute on function public.fetch_my_recipe_submissions(timestamptz, uuid, int, text) to authenticated;

revoke all on function public.fetch_my_recipe_submission(uuid) from public, anon;
grant execute on function public.fetch_my_recipe_submission(uuid) to authenticated;

revoke all on function public.admin_list_recipe_submissions(text, timestamptz, uuid, int) from public, anon;
grant execute on function public.admin_list_recipe_submissions(text, timestamptz, uuid, int) to authenticated;

revoke all on function public.admin_fetch_recipe_submission(uuid) from public, anon;
grant execute on function public.admin_fetch_recipe_submission(uuid) to authenticated;

revoke all on function public.admin_approve_recipe_submission(
  uuid, timestamptz, uuid, text, text, text, text, text, jsonb, jsonb, text[], boolean, text, boolean, smallint, text, text
) from public, anon;
grant execute on function public.admin_approve_recipe_submission(
  uuid, timestamptz, uuid, text, text, text, text, text, jsonb, jsonb, text[], boolean, text, boolean, smallint, text, text
) to authenticated;

revoke all on function public.recipe_submitted_by_name(uuid) from public;
grant execute on function public.recipe_submitted_by_name(uuid) to anon, authenticated, service_role;

revoke execute on function public.fetch_recipe_detail(uuid, text) from public;
grant execute on function public.fetch_recipe_detail(uuid, text)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
