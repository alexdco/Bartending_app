-- Address advisor lints: pin function search_path, move pg_trgm out of public.

create schema if not exists extensions;

alter extension pg_trgm set schema extensions;

drop index if exists public.ingredients_name_trgm_idx;
create index ingredients_name_trgm_idx on public.ingredients using gin (name extensions.gin_trgm_ops);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
