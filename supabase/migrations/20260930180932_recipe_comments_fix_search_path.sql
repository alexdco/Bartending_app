-- Pin search_path on the comments updated_at trigger function, matching the
-- lint fix applied immediately after the comments table's own migration.

create or replace function public.set_comments_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.body is distinct from old.body then
    new.updated_at = now();
  end if;
  return new;
end;
$$;
