-- Language agnostic locales, migration C (spec 0045, build steps 5 and 6).
--
-- 1. apply_recipe_notes is dropped and recreated (its parameter name, payload,
--    and return type all change). Each proposal carries a translations object
--    keyed by locale in place of the es_* fields, and the result is an object
--    of the recipe ids skipped per locale for having no translation row. Still
--    all or nothing across every locale in a run.
-- 2. admin_set_recipe_translation_notes lets an admin fix one locale's notes.
--    A blank note is stored as null, so the page falls back to English.

drop function public.apply_recipe_notes(jsonb);

create function public.apply_recipe_notes(p_proposals jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  bad_count int;
  skipped jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('apply_recipe_notes'));

  if p_proposals is null or jsonb_typeof(p_proposals) <> 'array' then
    raise exception 'apply_recipe_notes: proposals must be a JSON array'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_proposals) e
    where jsonb_typeof(e) <> 'object'
      or jsonb_typeof(e -> 'translations') is distinct from 'object'
  ) then
    raise exception 'apply_recipe_notes: every proposal must be an object with a translations object'
      using errcode = '22023';
  end if;

  create temporary table pg_temp.proposed_notes on commit drop as
  select
    p.id,
    p.drink_style,
    btrim(p.drink_style_note, E' \t\r\n') as drink_style_note,
    btrim(p.bartender_tip, E' \t\r\n') as bartender_tip,
    btrim(p.presentation_tip, E' \t\r\n') as presentation_tip
  from jsonb_to_recordset(p_proposals) as p(
    id uuid,
    drink_style text,
    drink_style_note text,
    bartender_tip text,
    presentation_tip text
  );

  create temporary table pg_temp.proposed_translations on commit drop as
  select
    (e ->> 'id')::uuid as id,
    t.key as locale,
    btrim(t.value ->> 'drink_style_note', E' \t\r\n') as drink_style_note,
    btrim(t.value ->> 'bartender_tip', E' \t\r\n') as bartender_tip,
    btrim(t.value ->> 'presentation_tip', E' \t\r\n') as presentation_tip
  from jsonb_array_elements(p_proposals) e
  cross join lateral jsonb_each(e -> 'translations') t;

  if (select count(*) from pg_temp.proposed_notes) <> (select count(distinct id) from pg_temp.proposed_notes) then
    raise exception 'apply_recipe_notes: duplicate or missing recipe ids'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from pg_temp.proposed_translations pt
    where public.resolve_locale(pt.locale) is null
  ) then
    raise exception 'apply_recipe_notes: a translations key is en or not a supported locale'
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
        (p.drink_style_note), (p.bartender_tip), (p.presentation_tip)
      ) v(t)
      where v.t is null or char_length(v.t) not between 1 and 240
    )
    or exists (
      select 1
      from pg_temp.proposed_translations pt
      cross join lateral (values
        (pt.drink_style_note), (pt.bartender_tip), (pt.presentation_tip)
      ) v(t)
      where pt.id = p.id
        and (v.t is null or char_length(v.t) not between 1 and 240)
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
  set drink_style_note = pt.drink_style_note,
      bartender_tip = pt.bartender_tip,
      presentation_tip = pt.presentation_tip
  from pg_temp.proposed_translations pt
  where rt.recipe_id = pt.id
    and rt.locale = pt.locale;

  select coalesce(jsonb_object_agg(per_locale.locale, per_locale.ids), '{}'::jsonb) into skipped
  from (
    select
      pt.locale,
      coalesce(
        jsonb_agg(pt.id order by pt.id) filter (
          where not exists (
            select 1 from public.recipe_translations rt
            where rt.recipe_id = pt.id and rt.locale = pt.locale
          )
        ),
        '[]'::jsonb
      ) as ids
    from pg_temp.proposed_translations pt
    group by pt.locale
  ) per_locale;

  return skipped;
end;
$$;

revoke execute on function public.apply_recipe_notes(jsonb) from public, anon, authenticated;
grant execute on function public.apply_recipe_notes(jsonb) to service_role;

create function public.admin_set_recipe_translation_notes(
  p_recipe_id uuid,
  p_locale text,
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
  v_note text := nullif(btrim(p_drink_style_note, E' \t\r\n'), '');
  v_bartender text := nullif(btrim(p_bartender_tip, E' \t\r\n'), '');
  v_presentation text := nullif(btrim(p_presentation_tip, E' \t\r\n'), '');
begin
  if not exists (
    select 1 from public.user_preferences up
    where up.user_id = auth.uid()
      and up.is_admin
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if public.resolve_locale(p_locale) is null then
    raise exception 'not a translation locale: %', p_locale
      using errcode = '22023';
  end if;

  if char_length(v_note) > 240
    or char_length(v_bartender) > 240
    or char_length(v_presentation) > 240
  then
    raise exception 'style sentence and tips must be 240 characters or fewer'
      using errcode = '22023';
  end if;

  update public.recipe_translations rt
  set drink_style_note = v_note,
      bartender_tip = v_bartender,
      presentation_tip = v_presentation
  where rt.recipe_id = p_recipe_id
    and rt.locale = p_locale;

  if not found then
    raise exception 'no % translation row for recipe %', p_locale, p_recipe_id
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_set_recipe_translation_notes(uuid, text, text, text, text) from public, anon;
grant execute on function public.admin_set_recipe_translation_notes(uuid, text, text, text, text) to authenticated;
