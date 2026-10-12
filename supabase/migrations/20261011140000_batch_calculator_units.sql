-- Batch calculator correctness (spec 0035): widen the recipe_ingredients
-- unit check to every unit the shared parser now stores (each under its own
-- name, so a shot stays a shot; unit sizes live only in code), and enforce
-- that amount_value and amount_unit are always both null or both set.
-- Widening a check never rejects existing rows. The pair check is guarded
-- by a count that must be 0, so it can never fail halfway through apply.
-- Spec: docs/specs/0035-batch-calculator-correctness/index.md

do $$
declare
  broken_pairs bigint;
begin
  select count(*) into broken_pairs
  from public.recipe_ingredients
  where (amount_value is null) <> (amount_unit is null);

  if broken_pairs <> 0 then
    raise exception
      'recipe_ingredients has % rows with only one of amount_value/amount_unit set; fix them before adding recipe_ingredients_amount_pair_check',
      broken_pairs;
  end if;
end $$;

alter table public.recipe_ingredients
  drop constraint if exists recipe_ingredients_amount_unit_check;

alter table public.recipe_ingredients
  add constraint recipe_ingredients_amount_unit_check
  check (
    amount_unit is null
    or amount_unit in (
      'oz', 'ml', 'cl', 'tsp', 'tbsp', 'cup',
      'shot', 'jigger', 'dl', 'l', 'pint', 'qt', 'gal', 'part'
    )
  );

alter table public.recipe_ingredients
  drop constraint if exists recipe_ingredients_amount_pair_check;

alter table public.recipe_ingredients
  add constraint recipe_ingredients_amount_pair_check
  check ((amount_value is null) = (amount_unit is null));

comment on column public.recipe_ingredients.amount_value is
  'Parsed leading number from measure (e.g. 1.5 for "1 1/2 oz"; the part count for a part line). Null if measure could not be parsed.';
comment on column public.recipe_ingredients.amount_unit is
  'Unit parsed from measure, stored as written: oz/ml/cl/tsp/tbsp/cup/shot/jigger/dl/l/pint/qt/gal, or part (a ratio with no fixed volume). Null if measure could not be parsed.';
