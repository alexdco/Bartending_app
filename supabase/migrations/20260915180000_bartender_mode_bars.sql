-- Bartender Mode: shared bar (venue/team) data model.
--
-- A "bar" is a shared venue/team that staff join with a real (non anonymous)
-- account, so house recipes, the current menu, and an out of stock ("86'd")
-- ingredient list stay in sync across every staff member, not siloed per
-- device. See spec 0023-bartender-mode/0023-bar-data-model.md for the full
-- data model, RLS, and rationale.
--
-- method/straining are also added to the existing recipes table here, since
-- Quick Build Mode needs a structured "SHAKE then DOUBLE STRAIN" line for
-- catalog recipes, not just house recipes; nullable, backfilled by a Haiku
-- classification script mirroring recipes.difficulty's pattern.

-- recipes: method + straining ---------------------------------------------

alter table public.recipes
  add column method text,
  add column straining text;

comment on column public.recipes.method is
  'Haiku classified build method (e.g. "Shake", "Stir", "Build"). Null until classified by the backfill script or ongoing import classification step.';

comment on column public.recipes.straining is
  'Haiku classified straining technique (e.g. "Double strain", "Fine strain"). Null if not applicable to this method or not yet classified.';

alter table public.recipes
  add column method_source_name_hash text;

comment on column public.recipes.method_source_name_hash is
  'sha256 of the instructions text last classified for method/straining. Null until first classified.';

-- bars ----------------------------------------------------------------------

create table public.bars (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

comment on table public.bars is
  'A shared venue/team. House recipes, the current menu, and the 86 list are all scoped to a bar and shared across its members.';

-- bar_members -----------------------------------------------------------------

create table public.bar_members (
  bar_id uuid not null references public.bars (id) on delete cascade,
  user_id uuid not null references auth.users (id),
  role text not null,
  joined_at timestamptz not null default now(),
  primary key (bar_id, user_id)
);

alter table public.bar_members
  add constraint bar_members_role_check
  check (role in ('owner', 'staff'));

comment on table public.bar_members is
  'Staff membership in a bar. A user can belong to more than one bar. Joining requires a linked (non anonymous) account.';

create index bar_members_user_id_idx on public.bar_members (user_id);

-- bar_invites -----------------------------------------------------------------

create table public.bar_invites (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid not null references public.bars (id) on delete cascade,
  email text not null,
  invited_by uuid not null references auth.users (id),
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_by uuid references auth.users (id)
);

alter table public.bar_invites
  add constraint bar_invites_status_check
  check (status in ('pending', 'accepted', 'revoked'));

comment on table public.bar_invites is
  'A pending, accepted, or revoked invitation to join a bar as staff. Email is stored lowercased; matched case insensitively on acceptance.';

-- Only one live invite per (bar, email) at a time; accepted/revoked invites
-- don't block a fresh invite to the same address.
create unique index bar_invites_bar_id_email_pending_idx
  on public.bar_invites (bar_id, email)
  where status = 'pending';

create index bar_invites_email_idx on public.bar_invites (email);

-- bar_recipes -----------------------------------------------------------------

create table public.bar_recipes (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid not null references public.bars (id) on delete cascade,
  base_recipe_id uuid references public.recipes (id),
  name text not null,
  method text,
  straining text,
  instructions text,
  glass text,
  ice text,
  garnish text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.bar_recipes is
  'A house recipe: either an override of a catalog recipe (base_recipe_id set, unspecified fields copied forward at creation time, never live joined) or a fully independent recipe. Soft deleted via deleted_at, matching recipes'' pattern.';

comment on column public.bar_recipes.base_recipe_id is
  'Informational provenance link only; display never depends on a live join to this row, so a later edit or soft delete of the base recipe has no effect on this house recipe.';

create unique index bar_recipes_bar_id_name_active_idx
  on public.bar_recipes (bar_id, lower(name))
  where deleted_at is null;

create index bar_recipes_bar_id_idx on public.bar_recipes (bar_id) where deleted_at is null;

-- bar_recipe_ingredients --------------------------------------------------------

create table public.bar_recipe_ingredients (
  bar_recipe_id uuid not null references public.bar_recipes (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id),
  amount_value numeric,
  amount_unit text,
  sort_order int not null default 0,
  primary key (bar_recipe_id, ingredient_id)
);

alter table public.bar_recipe_ingredients
  add constraint bar_recipe_ingredients_amount_unit_check
  check (amount_unit is null or amount_unit in ('oz', 'ml', 'cl', 'tsp', 'tbsp', 'cup'));

comment on table public.bar_recipe_ingredients is
  'Ingredients for a house recipe. Always fully specified per bar_recipe (not diffed against a base), mirroring recipe_ingredients'' shape.';

create index bar_recipe_ingredients_ingredient_id_idx on public.bar_recipe_ingredients (ingredient_id);

-- bar_menu_items --------------------------------------------------------------

create table public.bar_menu_items (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid not null references public.bars (id) on delete cascade,
  bar_recipe_id uuid not null references public.bar_recipes (id) on delete cascade,
  sort_order int not null default 0,
  active boolean not null default true
);

comment on table public.bar_menu_items is
  'The current menu: a curated, ordered subset of a bar''s house recipes. A house recipe can exist without being on the menu.';

create unique index bar_menu_items_bar_id_bar_recipe_id_idx
  on public.bar_menu_items (bar_id, bar_recipe_id);

-- bar_ingredient_stock (the 86 list) --------------------------------------------

create table public.bar_ingredient_stock (
  bar_id uuid not null references public.bars (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id),
  is_86d boolean not null default false,
  updated_by uuid not null references auth.users (id),
  updated_at timestamptz not null default now(),
  primary key (bar_id, ingredient_id)
);

comment on table public.bar_ingredient_stock is
  'Per bar out of stock ("86''d") status for an ingredient. Any member (owner or staff) can update it, since front line staff are the ones who notice stock changes.';

-- pinned_recipes ----------------------------------------------------------------

create table public.pinned_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  recipe_id uuid references public.recipes (id),
  bar_recipe_id uuid references public.bar_recipes (id),
  sort_order int not null default 0,
  pinned_at timestamptz not null default now()
);

alter table public.pinned_recipes
  add constraint pinned_recipes_exactly_one_target_check
  check (num_nonnulls(recipe_id, bar_recipe_id) = 1);

comment on table public.pinned_recipes is
  'A bartender''s personal pinned cocktails, capped at 20 (enforced by trigger). References exactly one of recipe_id (catalog) or bar_recipe_id (house recipe). A bar_recipe_id pin is hidden, not deleted, once the user leaves that recipe''s bar or it is soft deleted; see pinned_recipes_visible below.';

create unique index pinned_recipes_user_id_recipe_id_idx
  on public.pinned_recipes (user_id, recipe_id)
  where recipe_id is not null;

create unique index pinned_recipes_user_id_bar_recipe_id_idx
  on public.pinned_recipes (user_id, bar_recipe_id)
  where bar_recipe_id is not null;

-- Enforce the 20 pin cap at the database level (counts every pin the user
-- has, including any currently hidden by the visibility view below), so a
-- direct API call can't bypass a client side check.
create function public.check_pinned_recipes_cap()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select count(*) from public.pinned_recipes where user_id = new.user_id) >= 20 then
    raise exception 'pin limit reached: a bartender can pin at most 20 cocktails'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger pinned_recipes_cap_trigger
  before insert on public.pinned_recipes
  for each row
  execute function public.check_pinned_recipes_cap();

-- Read time visibility filter for pins: a bar_recipe pin is only visible
-- while the pinning user is still a live member of that recipe's bar and the
-- recipe itself is not soft deleted. A catalog recipe pin has no such filter.
-- This is a view, not a stored flag, so leaving/rejoining a bar or a house
-- recipe being restored needs no reconciliation step.
create view public.pinned_recipes_visible
with (security_invoker = true)
as
select p.*
from public.pinned_recipes p
where p.recipe_id is not null
   or exists (
     select 1
     from public.bar_recipes br
     join public.bar_members bm on bm.bar_id = br.bar_id and bm.user_id = p.user_id
     where br.id = p.bar_recipe_id
       and br.deleted_at is null
   );

comment on view public.pinned_recipes_visible is
  'pinned_recipes filtered to currently visible rows per AC-8: a bar_recipe pin disappears when the user leaves its bar or the recipe is soft deleted, and reappears automatically if they rejoin.';

-- Row level security ------------------------------------------------------------

alter table public.bars enable row level security;
alter table public.bar_members enable row level security;
alter table public.bar_invites enable row level security;
alter table public.bar_recipes enable row level security;
alter table public.bar_recipe_ingredients enable row level security;
alter table public.bar_menu_items enable row level security;
alter table public.bar_ingredient_stock enable row level security;
alter table public.pinned_recipes enable row level security;

-- bars: any member can read; creation is open to any linked user (they
-- become the owner via a bar_members row inserted in the same transaction
-- by the client, see createBar in packages/shared).
create policy bars_select on public.bars
  for select to authenticated
  using (
    (select auth.jwt() ->> 'is_anonymous') = 'false'
    and exists (
      select 1 from public.bar_members bm
      where bm.bar_id = bars.id and bm.user_id = (select auth.uid())
    )
  );

create policy bars_insert on public.bars
  for insert to authenticated
  with check (
    (select auth.jwt() ->> 'is_anonymous') = 'false'
    and created_by = (select auth.uid())
  );

-- bar_members: any member can read the roster; a user can remove their own
-- row (leave); only an owner can remove another member's row (or their own,
-- covered by the same policy).
create policy bar_members_select on public.bar_members
  for select to authenticated
  using (
    (select auth.jwt() ->> 'is_anonymous') = 'false'
    and exists (
      select 1 from public.bar_members bm
      where bm.bar_id = bar_members.bar_id and bm.user_id = (select auth.uid())
    )
  );

create policy bar_members_delete on public.bar_members
  for delete to authenticated
  using (
    (select auth.jwt() ->> 'is_anonymous') = 'false'
    and (
      user_id = (select auth.uid())
      or exists (
        select 1 from public.bar_members bm
        where bm.bar_id = bar_members.bar_id
          and bm.user_id = (select auth.uid())
          and bm.role = 'owner'
      )
    )
  );

-- bar_invites: only an owner can see, create, or revoke invites for their
-- bar. Acceptance happens through the accept_bar_invite RPC (security
-- definer), not a direct table write, so no insert policy is needed for the
-- invitee.
create policy bar_invites_select on public.bar_invites
  for select to authenticated
  using (
    (select auth.jwt() ->> 'is_anonymous') = 'false'
    and exists (
      select 1 from public.bar_members bm
      where bm.bar_id = bar_invites.bar_id
        and bm.user_id = (select auth.uid())
        and bm.role = 'owner'
    )
  );

create policy bar_invites_insert on public.bar_invites
  for insert to authenticated
  with check (
    (select auth.jwt() ->> 'is_anonymous') = 'false'
    and invited_by = (select auth.uid())
    and exists (
      select 1 from public.bar_members bm
      where bm.bar_id = bar_invites.bar_id
        and bm.user_id = (select auth.uid())
        and bm.role = 'owner'
    )
  );

create policy bar_invites_update on public.bar_invites
  for update to authenticated
  using (
    (select auth.jwt() ->> 'is_anonymous') = 'false'
    and exists (
      select 1 from public.bar_members bm
      where bm.bar_id = bar_invites.bar_id
        and bm.user_id = (select auth.uid())
        and bm.role = 'owner'
    )
  )
  with check (
    exists (
      select 1 from public.bar_members bm
      where bm.bar_id = bar_invites.bar_id
        and bm.user_id = (select auth.uid())
        and bm.role = 'owner'
    )
  );

-- bar_recipes: any member reads; only an owner writes. USING and WITH CHECK
-- both scope to bar_id so an owner can't move a row to a bar they don't own.
create policy bar_recipes_select on public.bar_recipes
  for select to authenticated
  using (
    (select auth.jwt() ->> 'is_anonymous') = 'false'
    and exists (
      select 1 from public.bar_members bm
      where bm.bar_id = bar_recipes.bar_id and bm.user_id = (select auth.uid())
    )
  );

create policy bar_recipes_insert on public.bar_recipes
  for insert to authenticated
  with check (
    (select auth.jwt() ->> 'is_anonymous') = 'false'
    and created_by = (select auth.uid())
    and exists (
      select 1 from public.bar_members bm
      where bm.bar_id = bar_recipes.bar_id
        and bm.user_id = (select auth.uid())
        and bm.role = 'owner'
    )
  );

create policy bar_recipes_update on public.bar_recipes
  for update to authenticated
  using (
    (select auth.jwt() ->> 'is_anonymous') = 'false'
    and exists (
      select 1 from public.bar_members bm
      where bm.bar_id = bar_recipes.bar_id
        and bm.user_id = (select auth.uid())
        and bm.role = 'owner'
    )
  )
  with check (
    exists (
      select 1 from public.bar_members bm
      where bm.bar_id = bar_recipes.bar_id
        and bm.user_id = (select auth.uid())
        and bm.role = 'owner'
    )
  );

create policy bar_recipes_delete on public.bar_recipes
  for delete to authenticated
  using (
    (select auth.jwt() ->> 'is_anonymous') = 'false'
    and exists (
      select 1 from public.bar_members bm
      where bm.bar_id = bar_recipes.bar_id
        and bm.user_id = (select auth.uid())
        and bm.role = 'owner'
    )
  );

-- bar_recipe_ingredients: follows the parent bar_recipe's bar membership /
-- ownership, since it has no bar_id of its own.
create policy bar_recipe_ingredients_select on public.bar_recipe_ingredients
  for select to authenticated
  using (
    (select auth.jwt() ->> 'is_anonymous') = 'false'
    and exists (
      select 1
      from public.bar_recipes br
      join public.bar_members bm on bm.bar_id = br.bar_id
      where br.id = bar_recipe_ingredients.bar_recipe_id
        and bm.user_id = (select auth.uid())
    )
  );

create policy bar_recipe_ingredients_all_write on public.bar_recipe_ingredients
  for all to authenticated
  using (
    (select auth.jwt() ->> 'is_anonymous') = 'false'
    and exists (
      select 1
      from public.bar_recipes br
      join public.bar_members bm on bm.bar_id = br.bar_id
      where br.id = bar_recipe_ingredients.bar_recipe_id
        and bm.user_id = (select auth.uid())
        and bm.role = 'owner'
    )
  )
  with check (
    exists (
      select 1
      from public.bar_recipes br
      join public.bar_members bm on bm.bar_id = br.bar_id
      where br.id = bar_recipe_ingredients.bar_recipe_id
        and bm.user_id = (select auth.uid())
        and bm.role = 'owner'
    )
  );

-- bar_menu_items: any member reads; only an owner writes.
create policy bar_menu_items_select on public.bar_menu_items
  for select to authenticated
  using (
    (select auth.jwt() ->> 'is_anonymous') = 'false'
    and exists (
      select 1 from public.bar_members bm
      where bm.bar_id = bar_menu_items.bar_id and bm.user_id = (select auth.uid())
    )
  );

create policy bar_menu_items_all_write on public.bar_menu_items
  for all to authenticated
  using (
    (select auth.jwt() ->> 'is_anonymous') = 'false'
    and exists (
      select 1 from public.bar_members bm
      where bm.bar_id = bar_menu_items.bar_id
        and bm.user_id = (select auth.uid())
        and bm.role = 'owner'
    )
  )
  with check (
    exists (
      select 1 from public.bar_members bm
      where bm.bar_id = bar_menu_items.bar_id
        and bm.user_id = (select auth.uid())
        and bm.role = 'owner'
    )
  );

-- bar_ingredient_stock: any member reads or writes (owner or staff), since
-- staff are the ones who notice stock changes mid shift.
create policy bar_ingredient_stock_select on public.bar_ingredient_stock
  for select to authenticated
  using (
    (select auth.jwt() ->> 'is_anonymous') = 'false'
    and exists (
      select 1 from public.bar_members bm
      where bm.bar_id = bar_ingredient_stock.bar_id and bm.user_id = (select auth.uid())
    )
  );

create policy bar_ingredient_stock_all_write on public.bar_ingredient_stock
  for all to authenticated
  using (
    (select auth.jwt() ->> 'is_anonymous') = 'false'
    and exists (
      select 1 from public.bar_members bm
      where bm.bar_id = bar_ingredient_stock.bar_id and bm.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.bar_members bm
      where bm.bar_id = bar_ingredient_stock.bar_id and bm.user_id = (select auth.uid())
    )
  );

-- pinned_recipes: owner scoped, like favorites/pantry_items. No linked
-- account requirement here; personal data works for anonymous or linked
-- users, matching the rest of the app.
create policy pinned_recipes_select on public.pinned_recipes
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy pinned_recipes_insert on public.pinned_recipes
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy pinned_recipes_update on public.pinned_recipes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy pinned_recipes_delete on public.pinned_recipes
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- RPCs ------------------------------------------------------------------------

-- accept_bar_invite: security definer because it must insert a bar_members
-- row on behalf of the invitee, which the invitee has no direct insert
-- policy for. Re-derives the caller from auth.uid() and re-checks the
-- email match and linked-account requirement inside the function body,
-- never trusting a client supplied identity.
create function public.accept_bar_invite(p_invite_id uuid)
returns public.bar_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.bar_invites;
  v_user_email text;
  v_member public.bar_members;
begin
  if (select auth.jwt() ->> 'is_anonymous') = 'true' then
    raise exception 'a linked account is required to join a bar' using errcode = '42501';
  end if;

  select * into v_invite
  from public.bar_invites
  where id = p_invite_id
    and status = 'pending'
    and expires_at > now();

  if not found then
    raise exception 'invite not found, not pending, or expired' using errcode = 'no_data_found';
  end if;

  select lower(email) into v_user_email from auth.users where id = auth.uid();

  if v_user_email is distinct from v_invite.email then
    raise exception 'this invite was sent to a different email address' using errcode = '42501';
  end if;

  select * into v_member
  from public.bar_members
  where bar_id = v_invite.bar_id and user_id = auth.uid();

  if found then
    update public.bar_invites set status = 'accepted', accepted_by = auth.uid()
      where id = p_invite_id;
    return v_member;
  end if;

  insert into public.bar_members (bar_id, user_id, role)
  values (v_invite.bar_id, auth.uid(), 'staff')
  returning * into v_member;

  update public.bar_invites set status = 'accepted', accepted_by = auth.uid()
    where id = p_invite_id;

  return v_member;
end;
$$;

revoke all on function public.accept_bar_invite(uuid) from public;
grant execute on function public.accept_bar_invite(uuid) to authenticated;

-- toggle_86_status: security definer to force updated_by from auth.uid()
-- server side rather than trust a client supplied value; RLS on
-- bar_ingredient_stock still governs who may call this in the first place
-- since the function checks membership itself as well (defense in depth,
-- since a security definer function bypasses RLS).
create function public.toggle_86_status(p_bar_id uuid, p_ingredient_id uuid, p_is_86d boolean)
returns public.bar_ingredient_stock
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.bar_ingredient_stock;
begin
  if (select auth.jwt() ->> 'is_anonymous') = 'true' then
    raise exception 'a linked account is required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.bar_members
    where bar_id = p_bar_id and user_id = auth.uid()
  ) then
    raise exception 'not a member of this bar' using errcode = '42501';
  end if;

  if not exists (select 1 from public.ingredients where id = p_ingredient_id) then
    raise exception 'ingredient not found' using errcode = 'no_data_found';
  end if;

  insert into public.bar_ingredient_stock (bar_id, ingredient_id, is_86d, updated_by, updated_at)
  values (p_bar_id, p_ingredient_id, p_is_86d, auth.uid(), now())
  on conflict (bar_id, ingredient_id)
  do update set is_86d = excluded.is_86d, updated_by = auth.uid(), updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.toggle_86_status(uuid, uuid, boolean) from public;
grant execute on function public.toggle_86_status(uuid, uuid, boolean) to authenticated;

-- fetch_bar_service_data: the Service screen's single read for a bar's menu,
-- house recipes, and 86 list. Security definer so it can assemble all three
-- in one call under an explicit membership check, mirroring
-- fetch_recipe_detail's jsonb_agg aggregation style.
create function public.fetch_bar_service_data(p_bar_id uuid)
returns table (
  menu jsonb,
  house_recipes jsonb,
  stock_86 jsonb
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
    ) as stock_86;
end;
$$;

revoke all on function public.fetch_bar_service_data(uuid) from public;
grant execute on function public.fetch_bar_service_data(uuid) to authenticated;
