-- supported_locales.text_search_config: regconfig -> text (spec 0045).
--
-- A stored reg* column blocks Postgres major upgrades via pg_upgrade (Supabase
-- advisor unsupported_reg_types). The column becomes text; a check casts it so
-- an unknown config is still rejected on write, and the trigger and
-- locale_search_config cast it to regconfig where they use it. Behavior is
-- unchanged.

alter table public.supported_locales
  alter column text_search_config type text using text_search_config::text;

alter table public.supported_locales
  add constraint supported_locales_text_search_config_check
    check (text_search_config::regconfig is not null);

create or replace function public.recipe_translations_set_name_search()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  cfg regconfig;
begin
  select sl.text_search_config::regconfig into cfg
  from public.supported_locales sl
  where sl.code = new.locale;

  if cfg is null then
    raise exception 'no text search config for locale %', new.locale
      using errcode = '22023';
  end if;

  new.name_search := to_tsvector(cfg, new.name);
  return new;
end;
$$;

create or replace function public.locale_search_config(p_locale text)
returns regconfig
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (
      select sl.text_search_config::regconfig
      from public.supported_locales sl
      where sl.code = public.resolve_locale(p_locale)
    ),
    'pg_catalog.english'::regconfig
  );
$$;
