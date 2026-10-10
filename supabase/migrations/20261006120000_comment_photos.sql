-- Recipe comment photos (spec 0032).
--
-- A comment can now be text, photos (up to 3), or both. Photos are uploaded
-- by the client into a public `comment-photos` bucket under the uploader's
-- own folder, then attached through one atomic security definer function
-- (post_comment / edit_comment). The spec 0027 direct insert/update path stays
-- for text only comments so installed mobile builds keep working, but it can
-- no longer produce a comment without text.

-- comments.body becomes nullable ---------------------------------------------
--
-- null means "no text". The length check still applies to any non null body.
-- A null body is only ever written by the functions below, which require at
-- least one photo in that case.

alter table public.comments alter column body drop not null;

alter table public.comments drop constraint comments_body_check;

alter table public.comments
  add constraint comments_body_check
  check (body is null or char_length(btrim(body)) between 1 and 1000);

drop policy comments_insert on public.comments;

create policy comments_insert on public.comments
  for insert
  to authenticated
  with check (
    (select auth.jwt() ->> 'is_anonymous') = 'false'
    and (select auth.uid()) = user_id
    and body is not null
    and exists (
      select 1 from public.recipes r
      where r.id = recipe_id
        and r.deleted_at is null
    )
  );

drop policy comments_update on public.comments;

create policy comments_update on public.comments
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and body is not null
    and exists (
      select 1 from public.recipes r
      where r.id = recipe_id
        and r.deleted_at is null
    )
  );

-- comment_photos ------------------------------------------------------------

create table public.comment_photos (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null unique
    check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'),
  position smallint not null check (position between 0 and 2),
  width integer not null check (width between 1 and 1600),
  height integer not null check (height between 1 and 1600),
  alt_text text check (alt_text is null or char_length(btrim(alt_text)) between 1 and 200),
  created_at timestamptz not null default now(),
  -- Deferred so a reorder inside one edit_comment transaction never trips it.
  constraint comment_photos_comment_id_position_key
    unique (comment_id, position) deferrable initially deferred
);

create index comment_photos_user_id_idx on public.comment_photos (user_id);

alter table public.comment_photos enable row level security;

-- Readable whenever the parent comment is readable, so the soft deleted
-- recipe filter on comments carries over (AC-13).
create policy comment_photos_select on public.comment_photos
  for select
  to anon, authenticated
  using (
    exists (select 1 from public.comments c where c.id = comment_id)
  );

-- No direct writes: every photo write goes through the functions below.
revoke insert, update, delete, truncate on public.comment_photos from anon, authenticated;

-- Storage bucket ------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comment-photos', 'comment-photos', true, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

-- Whether any photo row points at this object. security definer so it sees
-- rows hidden by RLS (photos on a soft deleted recipe's comments); a plain
-- subquery in the delete policy would miss them and let an owner delete a
-- file that is still in use.
create or replace function public.is_comment_photo_referenced(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.comment_photos cp where cp.storage_path = p_name
  );
$$;

-- How many objects the caller uploaded into their own folder in the last 24
-- hours (AC-8). security definer so the count does not depend on what the
-- storage select policy lets the caller see.
create or replace function public.comment_photo_uploads_last_24h()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from storage.objects o
  where o.bucket_id = 'comment-photos'
    and o.name like (select auth.uid())::text || '/%'
    and o.created_at > now() - interval '24 hours';
$$;

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_preferences up
    where up.user_id = (select auth.uid())
      and up.is_admin
  );
$$;

revoke execute on function public.is_comment_photo_referenced(text) from public, anon;
revoke execute on function public.comment_photo_uploads_last_24h() from public, anon;
revoke execute on function public.is_current_user_admin() from public, anon;
grant execute on function public.is_comment_photo_referenced(text) to authenticated;
grant execute on function public.comment_photo_uploads_last_24h() to authenticated;
grant execute on function public.is_current_user_admin() to authenticated;

create policy comment_photos_storage_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'comment-photos'
    and (select auth.jwt() ->> 'is_anonymous') = 'false'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
    and (select public.comment_photo_uploads_last_24h()) < 30
  );

-- The Storage API's remove() deletes with a returning clause, which needs the
-- row to pass a select policy too. Scoped to the caller's own folder (or any
-- folder for the admin); public URLs never go through this policy.
create policy comment_photos_storage_select on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'comment-photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_current_user_admin())
    )
  );

create policy comment_photos_storage_delete on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'comment-photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_current_user_admin())
    )
    and not public.is_comment_photo_referenced(name)
  );

-- No update policy: stored files are immutable.

-- Internal helpers ----------------------------------------------------------

-- The comment plus its photos (ordered by position) in the jsonb shape the
-- functions return.
create or replace function public.comment_with_photos_json(p_comment_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id,
    'user_id', c.user_id,
    'recipe_id', c.recipe_id,
    'body', c.body,
    'created_at', c.created_at,
    'updated_at', c.updated_at,
    'photos', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', cp.id,
            'storage_path', cp.storage_path,
            'position', cp.position,
            'width', cp.width,
            'height', cp.height,
            'alt_text', cp.alt_text
          )
          order by cp.position
        )
        from public.comment_photos cp
        where cp.comment_id = c.id
      ),
      '[]'::jsonb
    )
  )
  from public.comments c
  where c.id = p_comment_id;
$$;

-- Trims a body; blank becomes null; over 1000 chars raises comment_too_long.
create or replace function public.normalize_comment_body(p_body text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_body text := nullif(btrim(p_body), '');
begin
  if v_body is not null and char_length(v_body) > 1000 then
    raise exception 'comment_too_long';
  end if;
  return v_body;
end;
$$;

-- Trims alt text; blank becomes null; anything not a string, or over 200
-- chars, raises invalid_photo.
create or replace function public.normalize_comment_photo_alt(p_item jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_alt text;
begin
  if p_item -> 'alt_text' is null or jsonb_typeof(p_item -> 'alt_text') = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_item -> 'alt_text') <> 'string' then
    raise exception 'invalid_photo';
  end if;
  v_alt := nullif(btrim(p_item ->> 'alt_text'), '');
  if v_alt is not null and char_length(v_alt) > 200 then
    raise exception 'invalid_photo';
  end if;
  return v_alt;
end;
$$;

-- Checks a new photo item ({path, width, height, alt_text?}) can be attached
-- by the caller, then inserts it at p_position. Raises invalid_photo on any
-- failed rule: wrong folder or pattern, object missing, uploaded 23 or more
-- hours ago (so the 24 hour sweep can never race an attach), already
-- attached, or bad dimensions.
create or replace function public.insert_new_comment_photo(
  p_comment_id uuid,
  p_user_id uuid,
  p_item jsonb,
  p_position integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
  v_width numeric;
  v_height numeric;
begin
  if jsonb_typeof(p_item -> 'path') is distinct from 'string'
    or jsonb_typeof(p_item -> 'width') is distinct from 'number'
    or jsonb_typeof(p_item -> 'height') is distinct from 'number' then
    raise exception 'invalid_photo';
  end if;

  v_path := p_item ->> 'path';
  v_width := (p_item ->> 'width')::numeric;
  v_height := (p_item ->> 'height')::numeric;

  if not starts_with(v_path, p_user_id::text || '/')
    or v_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
    or v_width <> trunc(v_width) or v_width not between 1 and 1600
    or v_height <> trunc(v_height) or v_height not between 1 and 1600 then
    raise exception 'invalid_photo';
  end if;

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'comment-photos'
      and o.name = v_path
      and o.created_at > now() - interval '23 hours'
  ) then
    raise exception 'invalid_photo';
  end if;

  if exists (select 1 from public.comment_photos cp where cp.storage_path = v_path) then
    raise exception 'invalid_photo';
  end if;

  insert into public.comment_photos (comment_id, user_id, storage_path, position, width, height, alt_text)
  values (
    p_comment_id,
    p_user_id,
    v_path,
    p_position,
    v_width::integer,
    v_height::integer,
    public.normalize_comment_photo_alt(p_item)
  );
end;
$$;

-- Signed in, non anonymous caller id, or raises not_signed_in.
create or replace function public.require_comment_author()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null or coalesce((select auth.jwt() ->> 'is_anonymous'), 'true') <> 'false' then
    raise exception 'not_signed_in';
  end if;
  return v_user_id;
end;
$$;

revoke execute on function public.comment_with_photos_json(uuid) from public, anon, authenticated;
revoke execute on function public.normalize_comment_body(text) from public, anon, authenticated;
revoke execute on function public.normalize_comment_photo_alt(jsonb) from public, anon, authenticated;
revoke execute on function public.insert_new_comment_photo(uuid, uuid, jsonb, integer) from public, anon, authenticated;
revoke execute on function public.require_comment_author() from public, anon, authenticated;

-- post_comment --------------------------------------------------------------

create or replace function public.post_comment(
  p_recipe_id uuid,
  p_body text default null,
  p_photos jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.require_comment_author();
  v_body text;
  v_photos jsonb := coalesce(p_photos, '[]'::jsonb);
  v_comment_id uuid;
  v_index integer;
begin
  if not exists (
    select 1 from public.recipes r
    where r.id = p_recipe_id
      and r.deleted_at is null
  ) then
    raise exception 'recipe_unavailable';
  end if;

  v_body := public.normalize_comment_body(p_body);

  if jsonb_typeof(v_photos) <> 'array' then
    raise exception 'invalid_photo';
  end if;

  if jsonb_array_length(v_photos) > 3 then
    raise exception 'too_many_photos';
  end if;

  if v_body is null and jsonb_array_length(v_photos) = 0 then
    raise exception 'comment_empty';
  end if;

  insert into public.comments (user_id, recipe_id, body)
  values (v_user_id, p_recipe_id, v_body)
  returning id into v_comment_id;

  for v_index in 0 .. jsonb_array_length(v_photos) - 1 loop
    perform public.insert_new_comment_photo(v_comment_id, v_user_id, v_photos -> v_index, v_index);
  end loop;

  return public.comment_with_photos_json(v_comment_id);
end;
$$;

-- edit_comment --------------------------------------------------------------
--
-- A full replacement: a blank or null p_body clears the text, and p_photos is
-- the complete final ordered list. Each item is {id, alt_text?} to keep an
-- existing photo or {path, width, height, alt_text?} to add one. updated_at
-- moves only when something actually changed.

create or replace function public.edit_comment(
  p_comment_id uuid,
  p_body text,
  p_photos jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.require_comment_author();
  v_comment public.comments%rowtype;
  v_body text;
  v_photos jsonb := coalesce(p_photos, '[]'::jsonb);
  v_item jsonb;
  v_index integer;
  v_kept_ids uuid[] := '{}';
  v_kept_id uuid;
  v_alt text;
  v_removed_paths text[];
  v_changed boolean := false;
  v_rows integer;
begin
  select * into v_comment
  from public.comments c
  where c.id = p_comment_id
    and c.user_id = v_user_id
  for update;

  if not found then
    raise exception 'not_found_or_not_owner';
  end if;

  if not exists (
    select 1 from public.recipes r
    where r.id = v_comment.recipe_id
      and r.deleted_at is null
  ) then
    raise exception 'recipe_unavailable';
  end if;

  v_body := public.normalize_comment_body(p_body);

  if jsonb_typeof(v_photos) <> 'array' then
    raise exception 'invalid_photo';
  end if;

  if jsonb_array_length(v_photos) > 3 then
    raise exception 'too_many_photos';
  end if;

  if v_body is null and jsonb_array_length(v_photos) = 0 then
    raise exception 'comment_empty';
  end if;

  -- Collect kept ids; each must belong to this comment and appear once.
  for v_index in 0 .. jsonb_array_length(v_photos) - 1 loop
    v_item := v_photos -> v_index;
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception 'invalid_photo';
    end if;
    if v_item ? 'id' then
      begin
        v_kept_id := (v_item ->> 'id')::uuid;
      exception when invalid_text_representation then
        raise exception 'invalid_photo';
      end;
      if v_kept_id = any (v_kept_ids) or not exists (
        select 1 from public.comment_photos cp
        where cp.id = v_kept_id
          and cp.comment_id = p_comment_id
      ) then
        raise exception 'invalid_photo';
      end if;
      v_kept_ids := v_kept_ids || v_kept_id;
    end if;
  end loop;

  -- Drop photo rows not in the final list, collecting their paths.
  with removed as (
    delete from public.comment_photos cp
    where cp.comment_id = p_comment_id
      and not (cp.id = any (v_kept_ids))
    returning cp.storage_path
  )
  select coalesce(array_agg(storage_path), '{}') into v_removed_paths from removed;

  if cardinality(v_removed_paths) > 0 then
    v_changed := true;
  end if;

  -- Update kept rows, insert new ones, at their array index.
  for v_index in 0 .. jsonb_array_length(v_photos) - 1 loop
    v_item := v_photos -> v_index;
    if v_item ? 'id' then
      v_alt := public.normalize_comment_photo_alt(v_item);
      update public.comment_photos cp
      set position = v_index,
          alt_text = v_alt
      where cp.id = (v_item ->> 'id')::uuid
        and (cp.position is distinct from v_index or cp.alt_text is distinct from v_alt);
      get diagnostics v_rows = row_count;
      if v_rows > 0 then
        v_changed := true;
      end if;
    else
      perform public.insert_new_comment_photo(p_comment_id, v_user_id, v_item, v_index);
      v_changed := true;
    end if;
  end loop;

  if v_body is distinct from v_comment.body then
    v_changed := true;
  end if;

  if v_changed then
    update public.comments c
    set body = v_body,
        updated_at = now()
    where c.id = p_comment_id;
  end if;

  return public.comment_with_photos_json(p_comment_id)
    || jsonb_build_object('removed_paths', to_jsonb(v_removed_paths));
end;
$$;

-- admin_delete_comment_photo ------------------------------------------------
--
-- Removes one photo. If that leaves the comment with no text and no photos,
-- the comment goes too (AC-11). Remaining photos are renumbered so positions
-- stay 0 to N minus 1 with no gaps. Does not bump updated_at: "(edited)" is
-- the owner's marker, not a moderation one.

create or replace function public.admin_delete_comment_photo(p_photo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comment_id uuid;
  v_path text;
  v_comment_deleted boolean := false;
begin
  if not public.is_current_user_admin() then
    raise exception 'not_admin';
  end if;

  delete from public.comment_photos cp
  where cp.id = p_photo_id
  returning cp.comment_id, cp.storage_path into v_comment_id, v_path;

  if v_comment_id is null then
    raise exception 'not_found';
  end if;

  if exists (
    select 1 from public.comments c
    where c.id = v_comment_id
      and c.body is null
      and not exists (select 1 from public.comment_photos cp where cp.comment_id = c.id)
  ) then
    delete from public.comments c where c.id = v_comment_id;
    v_comment_deleted := true;
  else
    update public.comment_photos cp
    set position = renumbered.new_position
    from (
      select id, (row_number() over (order by position) - 1)::smallint as new_position
      from public.comment_photos
      where comment_id = v_comment_id
    ) renumbered
    where cp.id = renumbered.id
      and cp.position <> renumbered.new_position;
  end if;

  return jsonb_build_object(
    'removed_paths', jsonb_build_array(v_path),
    'comment_deleted', v_comment_deleted
  );
end;
$$;

-- list_orphan_comment_photos ------------------------------------------------
--
-- Objects older than 24 hours that no photo row points to, oldest first.
-- Only the service role (the cleanup-orphan-comment-photos Edge Function)
-- may call it (AC-12).

create or replace function public.list_orphan_comment_photos(p_limit integer)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(name order by created_at), '{}')
  from (
    select o.name, o.created_at
    from storage.objects o
    where o.bucket_id = 'comment-photos'
      and o.created_at < now() - interval '24 hours'
      and not exists (
        select 1 from public.comment_photos cp where cp.storage_path = o.name
      )
    order by o.created_at
    limit greatest(p_limit, 0)
  ) orphans;
$$;

revoke execute on function public.post_comment(uuid, text, jsonb) from public, anon;
revoke execute on function public.edit_comment(uuid, text, jsonb) from public, anon;
revoke execute on function public.admin_delete_comment_photo(uuid) from public, anon;
grant execute on function public.post_comment(uuid, text, jsonb) to authenticated;
grant execute on function public.edit_comment(uuid, text, jsonb) to authenticated;
grant execute on function public.admin_delete_comment_photo(uuid) to authenticated;

revoke execute on function public.list_orphan_comment_photos(integer) from public, anon, authenticated;
grant execute on function public.list_orphan_comment_photos(integer) to service_role;
