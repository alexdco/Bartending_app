-- Hand run database checks for spec 0065 build plan task 1: the swap table
-- rules and client write lockout (AC-15), and the new fetch_bar_service_data
-- columns (substitutes, house_recipes[].alcohol_free) plus its unchanged
-- member check. Paste into the Supabase SQL editor after applying
-- 20261123130000_ingredient_substitutes.sql.
--
-- Runs inside begin ... rollback. The DO block always ends by raising an
-- exception, so everything it seeds (a user, a bar, stock rows, swaps) is
-- rolled back. The exception message IS the report: a PASS/FAIL line per
-- check. Uses two catalog ingredients picked by name (Lime Juice, Lemon Juice).
-- Spec: docs/specs/0065-ingredient-substitution-suggestions/index.md

begin;

create function pg_temp.try_as(p_role text, p_claims jsonb, p_sql text)
returns text
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', p_claims::text, true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
  exception when others then
    execute 'reset role';
    return sqlerrm;
  end;
  execute 'reset role';
  return 'ok';
end;
$$;

create function pg_temp.try_sql(p_sql text)
returns text
language plpgsql
as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end;
$$;

do $$
declare
  v_report text := '';
  v_lime uuid;
  v_lemon uuid;
  v_user uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_bar uuid;
  v_claims jsonb;
  v_res text;
  v_subs jsonb;
  v_house jsonb;
begin
  select id into v_lime from public.ingredients where name = 'Lime Juice';
  select id into v_lemon from public.ingredients where name = 'Lemon Juice';
  if v_lime is null or v_lemon is null then
    raise exception 'Lime Juice or Lemon Juice missing from the catalog';
  end if;

  -- AC-15: database rules, whatever the write path -------------------------------
  v_res := pg_temp.try_sql(format(
    'insert into public.ingredient_substitutes (ingredient_id, substitute_ingredient_id, rank) values (%L, %L, 1)',
    v_lime, v_lime));
  v_report := v_report || format(E'\n%s AC-15 self swap rejected (%s)',
    case when v_res like '%not_self%' then 'PASS' else 'FAIL' end, v_res);

  v_res := pg_temp.try_sql(format(
    'insert into public.ingredient_substitutes (ingredient_id, substitute_ingredient_id, rank) values (%L, %L, 6)',
    v_lemon, v_lime));
  v_report := v_report || format(E'\n%s AC-15 rank 6 rejected (%s)',
    case when v_res like '%rank_check%' then 'PASS' else 'FAIL' end, v_res);

  v_res := pg_temp.try_sql(format(
    'insert into public.ingredient_substitutes (ingredient_id, substitute_ingredient_id, rank, ratio) values (%L, %L, 5, 4.5)',
    v_lemon, v_lime));
  v_report := v_report || format(E'\n%s AC-15 ratio 4.5 rejected (%s)',
    case when v_res like '%ratio_check%' then 'PASS' else 'FAIL' end, v_res);

  v_res := pg_temp.try_sql(format(
    'insert into public.ingredient_substitutes (ingredient_id, substitute_ingredient_id, rank, note) values (%L, %L, 5, %L)',
    v_lemon, v_lime, ' padded '));
  v_report := v_report || format(E'\n%s AC-15 untrimmed note rejected (%s)',
    case when v_res like '%note_check%' then 'PASS' else 'FAIL' end, v_res);

  v_res := pg_temp.try_sql(format(
    'insert into public.ingredient_substitutes (ingredient_id, substitute_ingredient_id, rank, note) values (%L, %L, 5, %L)',
    v_lemon, v_lime, repeat('x', 121)));
  v_report := v_report || format(E'\n%s AC-15 121 character note rejected (%s)',
    case when v_res like '%note_check%' then 'PASS' else 'FAIL' end, v_res);

  delete from public.ingredient_substitutes where ingredient_id = v_lime;
  insert into public.ingredient_substitutes (ingredient_id, substitute_ingredient_id, rank, note)
    values (v_lime, v_lemon, 1, 'Check note');

  v_res := pg_temp.try_sql(format(
    'insert into public.ingredient_substitutes (ingredient_id, substitute_ingredient_id, rank) values (%L, (select id from public.ingredients where name = %L), 1)',
    v_lime, 'Grapefruit Juice'));
  v_report := v_report || format(E'\n%s AC-15 repeated rank rejected (%s)',
    case when v_res like '%rank_key%' then 'PASS' else 'FAIL' end, v_res);

  v_res := pg_temp.try_sql(format(
    'insert into public.ingredient_substitute_translations (ingredient_id, substitute_ingredient_id, locale, note, source_note_hash) values (%L, %L, %L, %L, %L)',
    v_lime, v_lemon, 'xx', 'Nota', md5('Check note')));
  v_report := v_report || format(E'\n%s AC-15 unknown locale rejected (%s)',
    case when v_res like '%foreign key%' then 'PASS' else 'FAIL' end, v_res);

  v_res := pg_temp.try_sql(format(
    'insert into public.ingredient_substitute_translations (ingredient_id, substitute_ingredient_id, locale, note, source_note_hash) values (%L, %L, %L, %L, %L)',
    v_lime, v_lemon, 'en', 'Note', md5('Check note')));
  v_report := v_report || format(E'\n%s AC-15 en translation rejected (%s)',
    case when v_res like '%locale_check%' then 'PASS' else 'FAIL' end, v_res);

  insert into public.ingredient_substitute_translations (ingredient_id, substitute_ingredient_id, locale, note, source_note_hash)
    values (v_lime, v_lemon, 'es', 'Nota', md5('Check note'));

  -- AC-15: clients read, never write -------------------------------------------
  v_claims := jsonb_build_object('sub', v_user, 'role', 'authenticated', 'is_anonymous', false);

  v_res := pg_temp.try_as('authenticated', v_claims, format(
    'insert into public.ingredient_substitutes (ingredient_id, substitute_ingredient_id, rank) values (%L, (select id from public.ingredients where name = %L), 2)',
    v_lime, 'Grapefruit Juice'));
  v_report := v_report || format(E'\n%s AC-15 authenticated insert rejected (%s)',
    case when v_res like '%permission denied%' then 'PASS' else 'FAIL' end, v_res);

  v_res := pg_temp.try_as('authenticated', v_claims,
    'update public.ingredient_substitutes set ratio = 2');
  v_report := v_report || format(E'\n%s AC-15 authenticated update rejected (%s)',
    case when v_res like '%permission denied%' then 'PASS' else 'FAIL' end, v_res);

  v_res := pg_temp.try_as('anon', '{"role":"anon"}'::jsonb,
    'delete from public.ingredient_substitute_translations');
  v_report := v_report || format(E'\n%s AC-15 anon translation delete rejected (%s)',
    case when v_res like '%permission denied%' then 'PASS' else 'FAIL' end, v_res);

  v_res := pg_temp.try_as('anon', '{"role":"anon"}'::jsonb,
    'select count(*) from public.ingredient_substitutes join public.ingredient_substitute_translations using (ingredient_id, substitute_ingredient_id)');
  v_report := v_report || format(E'\n%s AC-15 anon can read swaps and translations (%s)',
    case when v_res = 'ok' then 'PASS' else 'FAIL' end, v_res);

  -- fetch_bar_service_data ------------------------------------------------------
  insert into auth.users (id, email, aud, role)
    values (v_user, 'swap-check-' || v_user || '@example.invalid', 'authenticated', 'authenticated'),
           (v_outsider, 'swap-check-' || v_outsider || '@example.invalid', 'authenticated', 'authenticated');
  insert into public.bars (name, created_by) values ('Swap check bar', v_user) returning id into v_bar;
  insert into public.bar_members (bar_id, user_id, role) values (v_bar, v_user, 'owner');
  insert into public.bar_ingredient_stock (bar_id, ingredient_id, is_86d, updated_by)
    values (v_bar, v_lime, true, v_user);
  insert into public.bar_recipes (bar_id, name, created_by) values (v_bar, 'Lime soda', v_user);
  insert into public.bar_recipe_ingredients (bar_recipe_id, ingredient_id, amount_value, amount_unit)
    select id, v_lime, 1, 'oz' from public.bar_recipes where bar_id = v_bar;

  perform set_config('request.jwt.claims', v_claims::text, true);
  select s.substitutes, s.house_recipes into v_subs, v_house
    from public.fetch_bar_service_data(v_bar) s;

  v_report := v_report || format(E'\n%s substitutes lists the 86''d ingredient with its swap and es note',
    case when v_subs -> 0 ->> 'ingredient_id' = v_lime::text
      and v_subs -> 0 -> 'items' -> 0 ->> 'substitute_ingredient_id' = v_lemon::text
      and v_subs -> 0 -> 'items' -> 0 -> 'note_translations' -> 'es' ->> 'note' = 'Nota'
      and v_subs -> 0 -> 'items' -> 0 ->> 'note_hash' = md5('Check note')
    then 'PASS' else 'FAIL' end);

  v_report := v_report || format(E'\n%s AC-6 standalone house recipe with no spirit is alcohol_free',
    case when (v_house -> 0 ->> 'alcohol_free')::boolean then 'PASS' else 'FAIL' end);

  v_res := pg_temp.try_as('authenticated',
    jsonb_build_object('sub', v_outsider, 'role', 'authenticated', 'is_anonymous', false),
    format('select * from public.fetch_bar_service_data(%L)', v_bar));
  v_report := v_report || format(E'\n%s non member still rejected (%s)',
    case when v_res like '%not a member%' then 'PASS' else 'FAIL' end, v_res);

  v_res := pg_temp.try_as('anon', '{"role":"anon"}'::jsonb,
    format('select * from public.fetch_bar_service_data(%L)', v_bar));
  v_report := v_report || format(E'\n%s anon cannot execute (%s)',
    case when v_res like '%permission denied%' then 'PASS' else 'FAIL' end, v_res);

  raise exception '%', v_report;
end;
$$;

rollback;
