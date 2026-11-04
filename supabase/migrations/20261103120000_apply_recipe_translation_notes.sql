-- Language agnostic locales, migration D (spec 0045, build step 5b).
--
-- apply_recipe_translation_notes writes one locale's notes backfill, from
-- `propose-recipe-notes --locale <code>`, into that locale's
-- recipe_translations rows only. It reads recipes for the stale and gone
-- checks but never changes it, nor any other locale's row (AC-18).
--
-- Each proposal is { id, source, notes }: notes holds one to three note
-- fields, and source the English text each was translated from. A field
-- whose English text changed since propose is not written and is reported as
-- stale. A recipe deleted or unknown is reported as gone, and a live recipe
-- with no row for the locale as missing_row; neither blocks the rest. A
-- malformed proposal rejects the whole call with no writes.
--
-- Purely additive: a new function, so it applies whether or not migration C
-- is live. Shares apply_recipe_notes's advisory lock, so the two applies
-- never interleave.

create function public.apply_recipe_translation_notes(p_locale text, p_proposals jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('apply_recipe_notes'));

  if public.resolve_locale(p_locale) is null then
    raise exception 'apply_recipe_translation_notes: not a translation locale: %', p_locale
      using errcode = '22023';
  end if;

  if p_proposals is null or jsonb_typeof(p_proposals) <> 'array' then
    raise exception 'apply_recipe_translation_notes: proposals must be a JSON array'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_proposals) e
    where jsonb_typeof(e) <> 'object'
      or jsonb_typeof(e -> 'id') is distinct from 'string'
      or (e ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(e -> 'source') is distinct from 'object'
      or jsonb_typeof(e -> 'notes') is distinct from 'object'
      or e -> 'notes' = '{}'::jsonb
      or (select array_agg(k order by k) from jsonb_object_keys(e -> 'notes') k)
        is distinct from (select array_agg(k order by k) from jsonb_object_keys(e -> 'source') k)
  ) then
    raise exception 'apply_recipe_translation_notes: every proposal must have a uuid id and non empty source and notes objects with the same keys'
      using errcode = '22023';
  end if;

  if (select count(*) from jsonb_array_elements(p_proposals))
    <> (select count(distinct (e ->> 'id')::uuid) from jsonb_array_elements(p_proposals) e)
  then
    raise exception 'apply_recipe_translation_notes: a recipe id appears more than once'
      using errcode = '22023';
  end if;

  create temporary table pg_temp.proposed_fields on commit drop as
  select
    (e ->> 'id')::uuid as id,
    n.key as field,
    s.value as source_value,
    n.value as note_value
  from jsonb_array_elements(p_proposals) e
  cross join lateral jsonb_each(e -> 'notes') n
  join lateral jsonb_each(e -> 'source') s on s.key = n.key;

  if exists (
    select 1 from pg_temp.proposed_fields pf
    where pf.field not in ('drink_style_note', 'bartender_tip', 'presentation_tip')
      or jsonb_typeof(pf.source_value) <> 'string'
      or btrim(pf.source_value #>> '{}', E' \t\r\n') = ''
      or jsonb_typeof(pf.note_value) <> 'string'
      or char_length(btrim(pf.note_value #>> '{}', E' \t\r\n')) not between 1 and 240
  ) then
    raise exception 'apply_recipe_translation_notes: a field is not a note field, a source text is blank, or a note is blank or over 240 characters'
      using errcode = '22023';
  end if;

  create temporary table pg_temp.proposal_status on commit drop as
  select
    ids.id,
    case
      when r.id is null then 'gone'
      when rt.recipe_id is null then 'missing_row'
      else 'ok'
    end as status
  from (select distinct pf.id from pg_temp.proposed_fields pf) ids
  left join public.recipes r on r.id = ids.id and r.deleted_at is null
  left join public.recipe_translations rt on rt.recipe_id = r.id and rt.locale = p_locale;

  create temporary table pg_temp.field_status on commit drop as
  select
    pf.id,
    pf.field,
    btrim(pf.note_value #>> '{}', E' \t\r\n') as note,
    btrim(
      case pf.field
        when 'drink_style_note' then r.drink_style_note
        when 'bartender_tip' then r.bartender_tip
        else r.presentation_tip
      end,
      E' \t\r\n'
    ) is distinct from btrim(pf.source_value #>> '{}', E' \t\r\n') as stale
  from pg_temp.proposed_fields pf
  join pg_temp.proposal_status ps on ps.id = pf.id and ps.status = 'ok'
  join public.recipes r on r.id = pf.id;

  update public.recipe_translations rt
  set drink_style_note = coalesce(w.drink_style_note, rt.drink_style_note),
      bartender_tip = coalesce(w.bartender_tip, rt.bartender_tip),
      presentation_tip = coalesce(w.presentation_tip, rt.presentation_tip)
  from (
    select
      fs.id,
      max(fs.note) filter (where fs.field = 'drink_style_note') as drink_style_note,
      max(fs.note) filter (where fs.field = 'bartender_tip') as bartender_tip,
      max(fs.note) filter (where fs.field = 'presentation_tip') as presentation_tip
    from pg_temp.field_status fs
    where not fs.stale
    group by fs.id
  ) w
  where rt.recipe_id = w.id
    and rt.locale = p_locale;

  return jsonb_build_object(
    'missing_row', coalesce(
      (select jsonb_agg(ps.id order by ps.id) from pg_temp.proposal_status ps where ps.status = 'missing_row'),
      '[]'::jsonb
    ),
    'stale', coalesce(
      (select jsonb_agg(jsonb_build_object('id', fs.id, 'field', fs.field) order by fs.id, fs.field)
       from pg_temp.field_status fs where fs.stale),
      '[]'::jsonb
    ),
    'gone', coalesce(
      (select jsonb_agg(ps.id order by ps.id) from pg_temp.proposal_status ps where ps.status = 'gone'),
      '[]'::jsonb
    )
  );
end;
$$;

revoke execute on function public.apply_recipe_translation_notes(text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_recipe_translation_notes(text, jsonb) to service_role;
